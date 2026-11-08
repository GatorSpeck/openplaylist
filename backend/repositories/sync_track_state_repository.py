"""Per-target push state for playlist tracks (SyncTrackStateDB).

After each push we remember, per sync target, whether a local track matched on the remote
service and what it matched to. Later syncs use that to:

- retry tracks that failed to match once their details (or remote link) are fixed locally
- replace a remote match after the local track is relinked to a different remote id
- force a re-match for a track the user explicitly asked to resync

The snapshot diff alone can't do this safely: a track missing from the remote looks the same
whether it never got there or the remote user removed it on purpose.
"""
import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from lib.normalize import normalize_artist, normalize_title
from models import SyncTrackStateDB
from response_models import PlaylistItem, PlaylistSnapshot, SyncTarget

STATUS_MATCHED = "matched"
STATUS_UNMATCHED = "unmatched"
STATUS_RESYNC = "resync"  # user asked for this track to be re-matched on the next sync

# PlaylistItem field holding each service's remote id
SERVICE_ID_FIELDS = {
    "plex": "plex_rating_key",
    "spotify": "spotify_uri",
    "youtube": "youtube_url",
}

_SPOTIFY_ID = re.compile(r"(?:spotify:track:|open\.spotify\.com/(?:intl-[a-z-]+/)?track/)([A-Za-z0-9]{22})")
_YOUTUBE_ID = re.compile(r"(?:[?&]v=|youtu\.be/|/shorts/|/embed/)([\w-]{11})")


def canonical_remote_id(service: str, value: Optional[str]) -> Optional[str]:
    """Normalize the different ways a remote id can be written (URI, URL, bare id) so
    locally-entered links compare equal to what the service reports."""
    if value is None:
        return None
    value = str(value).strip()
    if not value:
        return None

    if service == "spotify":
        match = _SPOTIFY_ID.search(value)
        return match.group(1) if match else value
    if service == "youtube":
        match = _YOUTUBE_ID.search(value)
        return match.group(1) if match else value
    return value


def item_remote_id(service: str, item: PlaylistItem) -> Optional[str]:
    field = SERVICE_ID_FIELDS.get(service)
    return canonical_remote_id(service, getattr(item, field, None)) if field else None


def item_key(item: PlaylistItem) -> str:
    return f"{normalize_artist(item.artist or '')}:{normalize_title(item.title or '')}"[:1024]


def metadata_fingerprint(item: PlaylistItem) -> str:
    raw = "\x1f".join((v or "").strip().lower() for v in (item.artist, item.title, item.album))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def find_remote_item(service: str, snapshot: Optional[PlaylistSnapshot], remote_id: Optional[str]) -> Optional[PlaylistItem]:
    if not snapshot or not remote_id:
        return None
    for remote_item in snapshot.items:
        if item_remote_id(service, remote_item) == remote_id:
            return remote_item
    return None


def find_remote_counterpart(service: str, snapshot: Optional[PlaylistSnapshot], local_item: PlaylistItem) -> Optional[PlaylistItem]:
    """The remote item that currently stands in for a local one: by remote id, then by any
    of the usual snapshot match keys (music file, path, title/artist)."""
    if not snapshot:
        return None
    by_id = find_remote_item(service, snapshot, item_remote_id(service, local_item))
    if by_id:
        return by_id
    index = snapshot.build_key_index()
    for key in local_item.match_keys():
        if key in index:
            return index[key]
    return None


@dataclass
class TrackRepair:
    """A target-scoped fix: optionally remove the old remote match, then optionally re-add the
    local track (which makes the service resolve it again)."""
    local_item: PlaylistItem
    remove_item: Optional[PlaylistItem]
    add: bool
    reason: str


def plan_track_repairs(
    states: List[SyncTrackStateDB],
    local_snapshot: PlaylistSnapshot,
    remote_snapshot: Optional[PlaylistSnapshot],
    target: SyncTarget,
) -> Tuple[List[TrackRepair], List[SyncTrackStateDB], List[Tuple[PlaylistItem, str]]]:
    """Decide which previously-pushed tracks need fixing on this target. Pure - no I/O.

    Returns (repairs, stale_states, skipped) where stale_states are rows whose track is no
    longer in the local playlist (or is now on the remote), and skipped lists
    (item, reason) for tracks that need fixing but the target's send flags don't allow it.
    """
    service = target.service
    repairs: List[TrackRepair] = []
    stale: List[SyncTrackStateDB] = []
    skipped: List[Tuple[PlaylistItem, str]] = []

    if not target.sendEntryAdds:
        return repairs, stale, skipped

    by_music_file = {i.music_file_id: i for i in local_snapshot.items if i.music_file_id}
    by_key = {item_key(i): i for i in local_snapshot.items}

    for state in states:
        local_item = by_music_file.get(state.music_file_id) if state.music_file_id else by_key.get(state.item_key)
        if local_item is None:
            stale.append(state)
            continue

        local_id = item_remote_id(service, local_item)
        previous_id = canonical_remote_id(service, state.remote_id)
        metadata_changed = metadata_fingerprint(local_item) != state.metadata_fingerprint

        if state.status == STATUS_RESYNC:
            old_remote = find_remote_item(service, remote_snapshot, previous_id) or find_remote_counterpart(service, remote_snapshot, local_item)
            if old_remote is not None and not target.sendEntryRemovals:
                skipped.append((local_item, "Resync needs 'send removals' enabled to replace the existing remote track"))
                continue
            repairs.append(TrackRepair(local_item, old_remote, True, "Manual resync requested"))
            continue

        if state.status == STATUS_UNMATCHED:
            if find_remote_counterpart(service, remote_snapshot, local_item) is not None:
                stale.append(state)  # it made it onto the remote some other way
            elif metadata_changed or local_id:
                why = "linked to a remote track" if local_id and not metadata_changed else "track details changed"
                repairs.append(TrackRepair(local_item, None, True, f"Retrying previously unmatched track ({why})"))
            continue

        # Matched before. The link is authoritative, so only act when it changed, or when there
        # is no link and the details the match was based on changed.
        relinked = bool(local_id) and local_id != previous_id
        rematch = not local_id and metadata_changed
        if not (relinked or rematch):
            continue

        old_remote = find_remote_item(service, remote_snapshot, previous_id)
        if old_remote is None:
            # Old match isn't on the remote any more (removed there) - leave that decision alone
            continue

        if relinked and find_remote_item(service, remote_snapshot, local_id) is not None:
            if target.sendEntryRemovals:
                repairs.append(TrackRepair(local_item, old_remote, False, "Track relinked locally; removing old remote match"))
            continue

        if not target.sendEntryRemovals:
            skipped.append((local_item, "Track changed locally, but replacing its remote match needs 'send removals' enabled"))
            continue

        why = "Track relinked locally" if relinked else "Track details changed locally"
        repairs.append(TrackRepair(local_item, old_remote, True, f"{why}; replacing remote match"))

    return repairs, stale, skipped


class SyncTrackStateRepository:
    def __init__(self, session):
        self.session = session

    def get_states(self, target_id: int) -> List[SyncTrackStateDB]:
        return self.session.query(SyncTrackStateDB).filter(SyncTrackStateDB.sync_target_id == target_id).all()

    def _find(self, target_id: int, item: PlaylistItem) -> Optional[SyncTrackStateDB]:
        query = self.session.query(SyncTrackStateDB).filter(SyncTrackStateDB.sync_target_id == target_id)
        if item.music_file_id:
            return query.filter(SyncTrackStateDB.music_file_id == item.music_file_id).first()
        return query.filter(SyncTrackStateDB.music_file_id.is_(None), SyncTrackStateDB.item_key == item_key(item)).first()

    def _upsert(self, target_id: int, item: PlaylistItem, **values) -> SyncTrackStateDB:
        state = self._find(target_id, item)
        if state is None:
            state = SyncTrackStateDB(sync_target_id=target_id, music_file_id=item.music_file_id)
            self.session.add(state)
        state.item_key = item_key(item)
        state.metadata_fingerprint = metadata_fingerprint(item)
        for name, value in values.items():
            setattr(state, name, value)
        return state

    def record_push(self, target_id: int, item: PlaylistItem) -> None:
        """Remember the outcome of pushing an item, from the match the remote repository
        recorded on it (item.sync_match). Items without a recorded match are left alone."""
        match = getattr(item, "sync_match", None)
        if not match:
            return
        try:
            matched = bool(match.get("matched"))
            self._upsert(
                target_id,
                item,
                status=STATUS_MATCHED if matched else STATUS_UNMATCHED,
                remote_id=(str(match.get("remote_id"))[:1024] if matched and match.get("remote_id") else None),
                confidence={k: match.get(k) for k in ("score", "level", "needs_review")},
            )
            self.session.commit()
        except Exception as e:
            logging.error(f"Failed to record sync state for {item.to_string()}: {e}")
            self.session.rollback()

    def mark_matched(self, target_id: int, item: PlaylistItem, remote_id: Optional[str]) -> None:
        self._upsert(target_id, item, status=STATUS_MATCHED, remote_id=remote_id)
        self.session.commit()

    def mark_for_resync(self, target_id: int, item: PlaylistItem) -> None:
        state = self._find(target_id, item)
        if state is None:
            self._upsert(target_id, item, status=STATUS_RESYNC, remote_id=None, confidence=None)
        else:
            # Keep the fingerprint/remote id so the old remote match can still be found
            state.status = STATUS_RESYNC
        self.session.commit()

    def delete(self, states: List[SyncTrackStateDB]) -> None:
        if not states:
            return
        for state in states:
            self.session.delete(state)
        self.session.commit()

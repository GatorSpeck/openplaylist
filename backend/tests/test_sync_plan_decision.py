"""Direct unit tests for decide_sync_plan_application - the pure decision logic extracted from
sync_playlist()'s "apply the unified plan" step. No TestClient, database, or mocked remote repo
needed: everything here is plain SyncChange/SyncTarget/PlaylistSnapshot data, which is the whole
point of pulling this logic out on its own (see the #5 refactor plan).
"""
from repositories.remote_playlist_repository import SyncChange
from response_models import PlaylistItem, PlaylistSnapshot, SyncTarget
from routes.playlists import TargetSyncInfo, decide_sync_plan_application


def make_target(target_id, service="plex", **overrides):
    defaults = dict(
        id=target_id,
        service=service,
        sendEntryAdds=True,
        sendEntryRemovals=True,
        receiveEntryAdds=True,
        receiveEntryRemovals=True,
    )
    defaults.update(overrides)
    return SyncTarget(**defaults)


def make_item(title="Title A", artist="Artist A"):
    return PlaylistItem(artist=artist, title=title)


def snapshot_with(*items):
    snap = PlaylistSnapshot(name="snap", last_updated=__import__("datetime").datetime.now(), items=[])
    for item in items:
        snap.add_item(item)
    return snap


def empty_snapshot():
    return PlaylistSnapshot(name="snap", last_updated=__import__("datetime").datetime.now(), items=[])


def test_remote_add_only_credited_to_its_origin_target_not_a_sibling():
    """Regression test for bug #2: a track added directly on target A must not produce a
    receive log entry for sibling target B, even though B also has receiveEntryAdds enabled."""
    item = make_item()
    change = SyncChange('add', item, 'remote', 'observed on target A', origin_target_ids=(1,))

    target_infos = {
        1: TargetSyncInfo(target=make_target(1, service="youtube"), target_name="Target A"),
        2: TargetSyncInfo(target=make_target(2, service="plex"), target_name="Target B"),
    }
    current_snapshots = {1: empty_snapshot(), 2: empty_snapshot()}

    decision = decide_sync_plan_application([change], target_infos, current_snapshots, force_push=False)

    credited_targets = {entry.target for entry in decision.receive_log_entries}
    assert credited_targets == {"youtube"}
    # And nothing gets queued as an actual push to either target for a 'remote' change.
    assert decision.remote_ops[1]["add"] == []
    assert decision.remote_ops[2]["add"] == []


def test_remote_add_not_credited_when_receive_adds_disabled():
    item = make_item()
    change = SyncChange('add', item, 'remote', 'observed remotely', origin_target_ids=(1,))
    target_infos = {1: TargetSyncInfo(target=make_target(1, receiveEntryAdds=False), target_name="T")}

    decision = decide_sync_plan_application([change], target_infos, {1: empty_snapshot()}, force_push=False)

    assert decision.receive_log_entries == []


def test_local_add_queued_for_target_missing_the_item():
    item = make_item()
    change = SyncChange('add', item, 'local', 'added locally')
    target_infos = {1: TargetSyncInfo(target=make_target(1), target_name="T")}

    decision = decide_sync_plan_application([change], target_infos, {1: empty_snapshot()}, force_push=False)

    assert decision.remote_ops[1]["add"] == [change]


def test_local_add_skipped_for_target_that_already_has_the_item():
    item = make_item()
    change = SyncChange('add', item, 'local', 'added locally')
    target_infos = {1: TargetSyncInfo(target=make_target(1), target_name="T")}

    decision = decide_sync_plan_application([change], target_infos, {1: snapshot_with(item)}, force_push=False)

    assert decision.remote_ops[1]["add"] == []


def test_local_add_not_queued_when_send_adds_disabled():
    item = make_item()
    change = SyncChange('add', item, 'local', 'added locally')
    target_infos = {1: TargetSyncInfo(target=make_target(1, sendEntryAdds=False), target_name="T")}

    decision = decide_sync_plan_application([change], target_infos, {1: empty_snapshot()}, force_push=False)

    assert decision.remote_ops[1]["add"] == []


def test_force_push_queues_item_even_when_target_already_has_it():
    item = make_item()
    change = SyncChange('add', item, 'local', 'force push')
    target_infos = {1: TargetSyncInfo(target=make_target(1), target_name="T")}

    decision = decide_sync_plan_application([change], target_infos, {1: snapshot_with(item)}, force_push=True)

    assert decision.remote_ops[1]["add"] == [change]


def test_missing_snapshot_for_target_is_treated_like_target_lacks_the_item():
    item = make_item()
    change = SyncChange('add', item, 'local', 'added locally')
    target_infos = {1: TargetSyncInfo(target=make_target(1), target_name="T")}

    # target_id 1 has no entry in current_snapshots at all.
    decision = decide_sync_plan_application([change], target_infos, {}, force_push=False)

    assert decision.remote_ops[1]["add"] == [change]


def test_local_remove_queued_only_when_target_still_has_the_item():
    item = make_item()
    change = SyncChange('remove', item, 'local', 'removed locally')
    target_infos = {
        1: TargetSyncInfo(target=make_target(1), target_name="has it"),
        2: TargetSyncInfo(target=make_target(2), target_name="doesn't have it"),
    }
    current_snapshots = {1: snapshot_with(item), 2: empty_snapshot()}

    decision = decide_sync_plan_application([change], target_infos, current_snapshots, force_push=False)

    assert decision.remote_ops[1]["remove"] == [change]
    assert decision.remote_ops[2]["remove"] == []


def test_remote_remove_credited_only_to_origin_target():
    item = make_item()
    change = SyncChange('remove', item, 'remote', 'removed on target A', origin_target_ids=(1,))
    target_infos = {
        1: TargetSyncInfo(target=make_target(1, service="youtube"), target_name="A"),
        2: TargetSyncInfo(target=make_target(2, service="plex"), target_name="B"),
    }
    current_snapshots = {1: empty_snapshot(), 2: empty_snapshot()}

    decision = decide_sync_plan_application([change], target_infos, current_snapshots, force_push=False)

    credited_targets = {entry.target for entry in decision.receive_log_entries}
    assert credited_targets == {"youtube"}


def test_local_changes_excludes_local_sourced_and_preserves_order():
    item_a = make_item(title="A")
    item_b = make_item(title="B")
    item_c = make_item(title="C")
    local_add = SyncChange('add', item_a, 'local', 'added locally')
    remote_add = SyncChange('add', item_b, 'remote', 'added remotely', origin_target_ids=(1,))
    remote_remove = SyncChange('remove', item_c, 'remote', 'removed remotely', origin_target_ids=(1,))
    target_infos = {1: TargetSyncInfo(target=make_target(1), target_name="T")}

    decision = decide_sync_plan_application(
        [local_add, remote_add, remote_remove], target_infos, {1: empty_snapshot()}, force_push=False
    )

    assert decision.local_changes == [remote_add, remote_remove]

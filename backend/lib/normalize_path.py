def strip_path_root(path: str, root: str) -> str:
	"""
	Strip the root from the path, if it exists.
	"""
	if path.startswith(root):
		return path[len(root) + 1:]
	return path

def normalize_path(path: str) -> str:
	"""
	Normalize the path to use forward slashes and lowercase.
	"""
	return path.replace("\\", "/")
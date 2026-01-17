# Contributing to OpenPlaylist

## Pull Request Process

1. **Create a Feature Branch**: Create a new branch from `develop` for your changes
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**: Implement your feature or bug fix

3. **Run Tests Locally**: Ensure all tests pass before creating a PR
   ```bash
   cd backend
   source .venv/bin/activate
   python -m pytest tests/ -v
   ```

4. **Create Pull Request**: Open a PR targeting `develop` branch (or `main` for hotfixes)

5. **CI Checks**: The GitHub Actions workflows will automatically run tests and checks

6. **Code Review**: Wait for review and address any feedback

7. **Merge**: Once approved and all checks pass, the PR can be merged

## Commit Message Convention

We follow conventional commit format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools and libraries

### Examples
```
feat(api): add playlist export functionality
fix(search): resolve genre filtering issue
docs: update installation instructions
test(playlist): add tests for reordering functionality
```

## Code Style

- **Backend (Python)**: Follow PEP 8 style guidelines
- **Frontend (JavaScript/React)**: Use ESLint configuration
- **Formatting**: Consider using `black` for Python and `prettier` for JavaScript

## Testing

- All new features should include tests
- Bug fixes should include a test that reproduces the bug
- Aim for good test coverage, especially for critical functionality
- Tests should be fast and reliable

## Documentation

- Update README.md if you add new features or change setup instructions
- Add docstrings to new functions and classes
- Update API documentation if you modify endpoints
# Isomer Conversion Tools

### How to use
1. Source your environment variables. The variables you will require are:
- `PERSONAL_ACCESS_TOKEN` (Github personal access token)
- `USERNAME` (Github username)
- `GITHUB_ORG_NAME` (isomerpages)
- `BRANCH_REF` (usually staging)

Ideally, this should be done by the designated team account, not with your personal account.

2. Run `migrationScript.js` with the following command:

```
node migrationScript.js <repo name>
```


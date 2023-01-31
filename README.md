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

### To migrate from Netlify to Amplify

Prerequisites:

- AWS CLI installed
- Git
- Hub CLI

1. Run bash bash_scripts/netlify_to_amplify_migration/netlify_to_amplify_migration.sh
2. Enter the repo name (as per in the github isomerpages) and name (human readable name) as prompted
3. After script has successfully run, copy over the sql commands generated in sqlcommands.txt and run them directly onto production database

# Isomer Conversion Tools

## V2 migration

### How to use

1. Source your environment variables. The variables you will require are:

- `GITHUB_ACCESS_TOKEN` (Github personal access token)
- `USERNAME` (Github username)
- `GITHUB_ORG_NAME` (isomerpages)
- `BRANCH_REF` (usually staging)

Ideally, this should be done by the designated team account, not with your personal account.

2. Run `migrationScript.js` with the following command:

```
node migrationScript.js <repo name>
```

## Netlify to Amplify Migration

### How to use

1. Populate environment variables for the following
- `GITHUB_ACCESS_TOKEN` (Github personal access token)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

1. Navigate to src/amplify-migration/list-of-repos.csv
2. Populate the csv file with the desired values
3. Run `npm run amplify:migrate -- -user-id=<user-id>` in the command line. If you wish to use another CSV file, run `npm run amplify:migrate -- -user-id=457 -repo-path=<path-to-csv>`
4. Navigate to `src/amplify-migration/sqlcommands.txt`
5. Copy over the appended commands in the file and run them on production DB

### Email login migration

See [here](src/emailLogin/README.md) for the specific instructions to run the email login migration.

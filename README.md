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

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

1. Navigate to src/amplify-migration/amplifyMigrationScript.ts
2. Change the variable `listOfRepos` to the desired repos to be changed
3. Run `npm run amplifyMigration` in the command line
4. Navigate to `src/amplify-migration/sqlcommands.txt`
5. Copy over the appended commands in the file and run them on production DB

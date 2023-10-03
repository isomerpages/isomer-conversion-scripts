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

## How it works

Refer to here: https://www.notion.so/opengov/Netlify-to-Amplify-Migration-01b9baff55ef4aebbe9f472fadf5a096?pvs=4

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
6. If a redirects\_<repo-name>.json is created, copy and paste the file over to the corresponding Amplify app under the `Rewrites and redirects` tab name.
7. Check to see if there are any errors being reported in the `repos-with-errors.txt`.
8. As a sanity check, visit the site's staging site to see if everything is working as intended (look our for resources + images are loading properly)

### Notes

Certain special characters in file titles (e.g. `Å`) cannot be handled properly by the local file system - this will result in the following error:

```
Error occurred for <repoName>: Error: error: The following untracked working tree files would be overwritten by checkout:
<fileName>
```

These files will need to be manually modified before the script can be run again. Ensure that all references to this file are also updated with the simplified name.

### Email login migration

See [here](src/emailLogin/README.md) for the specific instructions to run the email login migration.

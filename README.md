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

3. Fill up this form after creating a csv: https://form.gov.sg/653b01a3ec066e001138f1b1
## Netlify to Amplify Migration

## How it works

Refer to here: https://www.notion.so/opengov/Netlify-to-Amplify-Migration-01b9baff55ef4aebbe9f472fadf5a096?pvs=4

### How to use

1. Create codespaces durectly from github by going to `https://github.com/isomerpages/isomer-conversion-scripts` -> "code" -> codespaces -> create codespaces on staging.

1. Create codespaces directly from github by going to `https://github.com/isomerpages/isomer-conversion-scripts` -> "code" -> codespaces -> create codespaces on staging.

1. Ensure you are logged into GitHub from CLI - https://docs.github.com/en/get-started/getting-started-with-git/caching-your-github-credentials-in-git as the script uses HTTPS auth. Quick way to check this is by running `gh auth status`, you should see something like this

```
✓ Logged in to github.com as kishore03109 (GITHUB_TOKEN)
  ✓ Git operations for github.com configured to use https protocol.
  ✓ Token: g************************************
```

3. Populate environment variables for the following

- `GITHUB_ACCESS_TOKEN` (Github personal access token)
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

4. Navigate to src/amplify-migration/list-of-repos.csv
5. Populate the csv file with the desired values
6. Run `npm run amplify:migrate -- -user-id=<user-id>` in the command line. If you wish to use another CSV file, run `npm run amplify:migrate -- -user-id=457 -repo-path=<path-to-csv>`
7. Navigate to `src/amplify-migration/sqlcommands.txt`
8. Copy over the appended commands in the file and run them on production DB
9. If a redirects\_<repo-name>.json is created, copy and paste the file over to the corresponding Amplify app under the `Rewrites and redirects` tab name.
10. Check to see if there are any errors being reported in the `logs.txt` file.
11. As a sanity check, visit the site's staging site to see if everything is working as intended (look our for resources + images are loading properly), check for any unexpected uncommitted `.md` file changes in the repo directory (/../<repo-name>).

### Notes

Certain special characters in file titles (e.g. `Å`) cannot be handled properly by the local file system - this will result in the following error:

```
Error occurred for <repoName>: Error: error: The following untracked working tree files would be overwritten by checkout:
<fileName>
```

These files will need to be manually modified before the script can be run again. Ensure that all references to this file are also updated with the simplified name.

#### Repair mode

As eng, there were multiple times where we faced issues with the previous scripts, and things went wrong somewhere. To enable eng to improve velocity, this scrip also has a repair mode. When this is set to true, the repo will NOT

1. create an amplify app
2. not update any staging and master branches of the amplify app
3. will make commits to the repo locally and merge them to the staging branch, but there will not be any pushes to remote
4. not update the SQL commands

The sole reason for this should be used for debugging files, and when there exists a large number of files to debug.

To run this, run
`npm run amplify:migrate -- -user-id=<user-id> -repair-mode=true` in the command line.
The file would exist at `../<repo-name>` for debugging purpose.

### Email login migration

See [here](src/emailLogin/README.md) for the specific instructions to run the email login migration.

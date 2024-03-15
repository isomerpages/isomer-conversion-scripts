# Email migration script

## How to use

### Setup

The following steps are needed before you can run the email login migration.

First, ensure that you are connected to [AWS VPN](https://www.notion.so/opengov/Instructions-to-use-OGP-s-AWS-VPN-e67226703cac459999b84c02200a3940) as only the VPN is whitelisted to use the EC2 instance<sup>1</sup>.

Next, you will require the correct environment variables and credentials.

- Go into the 1PW Isomer - Admin vault and search for the `.ssh/.env.<staging | prod>` file.
- Create a folder named .ssh in the root directory and place the `.env` files there.
- Search for the corresponding credentials `isomercms-<staging | production>-bastion.pem`
- Put these credentials into the .ssh folder also.

Also, ensure that the repo name and the team name of the github repository are the same before starting.

### Running the migration

1. Navigate to the `/src/emailLogin` folder.

2. Source your environment variables using `source .env`. The variables you will require are:

- `GITHUB_ACCESS_TOKEN` (Github personal access token)
- `GITHUB_ORG_NAME` (isomerpages)
- `DB_URI` (Refer to our environment variables)

Ideally, this should be done by the designated team account, not with your personal account.

3. Next, run the following command: `npm run jump:<staging | prod>`. This sets up the port-forwarding service.

4. Populate the `repos.csv` file with the list of repos

5. In a separate terminal, run `runMigration.js` with the following command:

```
node runMigration.js
```

This adds the new site member entries and also outputs texts file in `/<repo name>/[contributors | repos | insertQueries].txt` with the retrieved information, and documents the insert queries run. Github write access for the site members will also be removed.

6. Follow the instructions [here](https://www.notion.so/opengov/On-Call-Runbook-ab4bffa2472d47ef9b657242632da7f9?pvs=4#5e47d16fa9b44060a7d5deba7f44d5bf) to clone into the EFS.

7. Provide the emails outputted in `emails.csv` to Ops to prepare for sending emails.

## Standalone script to retrieve github user mapping (no change to db/github teams)

If you only want to retrieve the mapping of github login repos to email users, without the associated db/github teams changes, a standalone version of this script can also be run.

1. Follow steps 1-3 as above.

2. Populate the `reponames.csv` file with the list of repos, separated by new lines

3. In a separate terminal, run `getContributors.js` with the following command:

```
node getContributors.js
```

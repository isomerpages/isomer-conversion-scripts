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

1. Source your environment variables using `source .env`. The variables you will require are:

- `PERSONAL_ACCESS_TOKEN` (Github personal access token)
- `GITHUB_ORG_NAME` (isomerpages)
- `DB_URI` (Refer to our environment variables)

Ideally, this should be done by the designated team account, not with your personal account.

2. Next, run the following command: `npm run jump:<staging | prod>`. This sets up the port-forwarding service.

3. In a separate terminal, run `runMigration.js` with the following command:

```
node runMigration.js <repo name>
```

This adds the new site member entries and also outputs texts file in `/<repo name>/[contributors | repos | insertQueries].txt` with the retrieved information, and insert query run.

4. Finally, to prevent users from accessing github to edit their sites directly, remove write access of the Github team with the following command:

```
node removeGithubAccess.js <repo name>
```

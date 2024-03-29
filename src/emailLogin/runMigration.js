const axios = require('axios');
const fs = require('fs');

const { getDb } = require('../../db/index');
const { removeGithubAccess } = require('./removeGithubAccess');
const { logError } = require('./logUtils');

const { GITHUB_ACCESS_TOKEN, GITHUB_ORG_NAME: ISOMER_GITHUB_ORG_NAME } = process.env;

const ISOMER_USERS = ['isomeradmin', 'rc-davis', 'lamkeewei', 'pallani', 'LoneRifle', 'prestonlimlianjie', 'alexanderleegs', 'lisatjide', 'kwajiehao', 'gweiying', 'seaerchin', 'isomer-demo', 'NatMaeTan', ' jacksonOGP', 'chienlinggg', 'kathleenkhy', 'joshuajunmingt', 'audreytcy', 'yanjunquek', 'chloe-opengovsg', 'shazlithebestie', 'lennardl', 'oliverli', 'taufiq', 'kishore03109', 'harishv7', 'QiluXie'];

const REPO_LIST_PATH = './repos.csv';
const EMAIL_CSV_PATH = './emails.csv';

/**
 * Reading CSV file
 * @returns list of repos by their github name
 */
function getReposToMigrate(
  filePath,
) {
  const data = fs.readFileSync(filePath, 'utf8');
  return data.split('\n').slice(1);
}

const writeMigrationInfoToRecords = async (site, contributorRecord, repoRecord, insertRecord, emails) => {
  try {
    // write repo information and queries run to file
    if (!fs.existsSync('./emailMigrationData')) {
      fs.mkdirSync('./emailMigrationData');
    }
    const dirPath = `./emailMigrationData/${site}`;
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }
    fs.writeFileSync(`${dirPath}/contributors.txt`, contributorRecord);
    fs.writeFileSync(`${dirPath}/repos.txt`, repoRecord);
    fs.writeFileSync(`${dirPath}/insertQueries.txt`, insertRecord);
    emails.forEach((email) => {
      fs.appendFileSync(EMAIL_CSV_PATH, `${site},${email}\n`);
    });
  } catch (err) {
    logError(`The following error was encountered while writing records for site ${site}: ${err}`);
  }
};

const getSiteAndContributors = async (site, dbClient) => {
  try {
    const { data: respData } = await axios.get(
      `https://api.github.com/orgs/${ISOMER_GITHUB_ORG_NAME}/teams/${site}/members`,
      {
        headers: {
          Authorization: `token ${GITHUB_ACCESS_TOKEN}`,
        },
      },
    );
    if (!respData) {
      logError(`${site} has no members in the team - please check that the repo name and team name are the same`);
      throw new Error();
    }
    const contributorNames = respData
      .map(({ login }) => login)
      .filter((name) => !ISOMER_USERS.includes(name));
    // get user information
    const contributorQuery = `SELECT * FROM "users" WHERE ${contributorNames.map((githubId) => `github_id='${githubId}'`).join(' OR ')};`;
    const userData = (await dbClient.query(contributorQuery)).rows;
    console.log(userData);

    // get repo information
    const repoQuery = `SELECT sites.id, sites.job_status, sites.site_status, repos.name FROM "sites" JOIN "repos" ON sites.id = repos.site_id WHERE repos.name='${site}' AND sites.site_status != 'EMPTY';`;
    const repoData = (await dbClient.query(repoQuery)).rows;
    console.log(repoData);
    if (repoData.length !== 1) {
      // We expect to see exactly one entry for this repo name - any other number of entries is an error
      logError(`${site} has multiple matching entries or no matching entries - please check entry again`);
      throw new Error();
    }
    const repoId = repoData[0].id;

    // get list of whitelisted domains
    const whitelistQuery = 'SELECT * FROM "whitelist" WHERE expiry IS NULL;';
    const whitelistedDomains = (await dbClient.query(whitelistQuery)).rows.map((whitelistData) => whitelistData.email);

    // Migration army users - only whitelisted gmail/ymail/hotmail accounts in our db
    // eslint-disable-next-line quotes
    const isomerWhitelistQuery = `SELECT * FROM "whitelist" WHERE email LIKE '%@gmail.com' OR email LIKE '%@ymail.com' OR email LIKE '%@hotmail.com';`;
    const additionalIsomerEmails = (await dbClient.query(isomerWhitelistQuery)).rows.map((whitelistData) => whitelistData.email);

    const siteMemberValues = [];
    const siteMemberEmails = [];
    userData.forEach((user) => {
      const userId = user.id;
      if (!user.email) {
        // User not registered to an email
        return;
      }
      if (additionalIsomerEmails.includes(user.email) || user.email.endsWith('@open.gov.sg')) {
        // User is from migration army
        return;
      }
      siteMemberEmails.push(user.email);
      const userType = whitelistedDomains.filter((domain) => user.email.endsWith(domain)).length > 0 ? 'ADMIN' : 'CONTRIBUTOR';
      siteMemberValues.push(`(${userId}, ${repoId}, '${userType}')`);
    });
    if (siteMemberValues.length === 0) {
      logError(`${site} has no CMS editors`);
      throw new Error();
    }
    const insertQuery = `INSERT INTO "site_members" (user_id, site_id, role) VALUES\n${siteMemberValues.join(',\n')};`;
    await dbClient.query(insertQuery);
    console.log(insertQuery);
    await writeMigrationInfoToRecords(site, userData.map((userInfo) => JSON.stringify(userInfo)).join('\n'), JSON.stringify(repoData[0]), insertQuery, siteMemberEmails);
  } catch (err) {
    logError(`The following error occured while migrating ${site}: ${err}`);
    throw err;
  }
};

const main = async () => {
  const repos = getReposToMigrate(REPO_LIST_PATH);
  const dbClient = await getDb();
  logError(`=================${new Date()}=================`);
  fs.appendFileSync(EMAIL_CSV_PATH, `=================${new Date()}=================\n`);

  for (const repo of repos) {
    try {
      await getSiteAndContributors(repo, dbClient);
      await removeGithubAccess(repo);
    } catch (e) {
      continue;
    }
  }
  dbClient.end();
};

main();

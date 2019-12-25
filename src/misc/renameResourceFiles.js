/* eslint-disable no-plusplus */
/* eslint-disable consistent-return */
const axios = require('axios');
const btoa = require('btoa');
const yaml = require('js-yaml');
const base64 = require('base-64');
const slugify = require('slugify');
const Bluebird = require('bluebird');

// name of repo
const REPO = process.argv[2];

// constants
const { GITHUB_ORG_NAME } = process.env;
const { BRANCH_REF } = process.env;

// credentials with generic header
const { PERSONAL_ACCESS_TOKEN } = process.env;
const { USERNAME } = process.env;
const CREDENTIALS = `${USERNAME}:${PERSONAL_ACCESS_TOKEN}`;
const headers = {
  Authorization: `Basic ${btoa(CREDENTIALS)}`,
  Accept: 'application/json',
};

// get resource room name
async function getResourceRoomName() {
  try {
    const endpoint = `https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/contents/_config.yml`;

    const resp = await axios.get(endpoint, {
      params: {
        ref: BRANCH_REF,
      },
      headers,
    });

    if (resp.status === 404) throw new Error('Page does not exist');

    // parse response to get resource room name
    const { content } = resp.data;
    const contentObject = yaml.safeLoad(base64.decode(content));
    if (contentObject.resources_name) {
      return contentObject.resources_name;
    }
    throw new Error('Resource room does not exist');
  } catch (err) {
    console.log(err);
  }
}

// retrieve the tree item
async function getTree() {
  try {
    // Get the commits of the repo
    const { data: commits } = await axios.get(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/commits`, {
      params: {
        ref: BRANCH_REF,
      },
      headers,
    });
    // Get the tree sha of the latest commit
    const { commit: { tree: { sha: treeSha } } } = commits[0];
    const currentCommitSha = commits[0].sha;

    const { data: { tree: gitTree } } = await axios.get(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/git/trees/${treeSha}?recursive=1`, {
      params: {
        ref: BRANCH_REF,
      },
      headers,
    });

    return { gitTree, currentCommitSha };
  } catch (err) {
    console.log(err);
  }
}

// function which slugifies the file name
function generateResourceFileName(title, type, date) {
  const safeTitle = slugify(title).replace(/[^a-zA-Z-]/g, '');
  return `${date}-${type}-${safeTitle}.md`;
}

// function which prepends a 0 if the number string is less than 10
function minTwoDigits(n) {
  return (n < 10 ? '0' : '') + n;
}

// retrieve resource files to create new files with the correct
// titles and delete old files
async function retrieveResourceFiles(gitTree, resourceRoomName) {
  try {
    // separate resource pages from non resource pages
    const resourcePages = [];
    const nonResourcePages = [];
    // retrieve markdown pages in resource directories
    gitTree.forEach((curr) => {
      const { path, type } = curr;
      // only look at files within resources
      // only look at markdown pages, not directories
      if (path.split('/')[0] === resourceRoomName && path.split('.')[path.split('.').length - 1] === 'md' && path.split('/').length === 4) {
        resourcePages.push(curr);
      } else {
        nonResourcePages.push(curr);
      }
    });

    // retrieve resource page data
    const resourcePageData = await Bluebird.map(resourcePages, (page) => axios.get(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/contents/${page.path}`, {
      params: {
        ref: BRANCH_REF,
      },
      headers,
    }));

    // create new resource pages
    for (let i = 0; i < resourcePageData.length; i++) {
      // get attributes from github response
      const { data: { content, path } } = resourcePageData[i];
      const decodedContent = yaml.safeLoad(base64.decode(content).split('---')[1]);
      const { date, title } = decodedContent;

      // split the path
      const pathArr = path.split('/');
      const resourceRoomNameIndex = pathArr.findIndex((element) => element === resourceRoomName);
      const type = pathArr[resourceRoomNameIndex + 2].slice(1);

      const dateType = typeof date;
      let computedDate;

      // compute the date
      if (dateType === 'object') {
        computedDate = `${date.getFullYear()}-${minTwoDigits(date.getMonth())}-${minTwoDigits(date.getDate())}`;
      } else if (dateType === 'string') {
        computedDate = date;
      }

      // create the resource files
      const newFileName = generateResourceFileName(title, type, computedDate);
      const newFilePath = `${pathArr.slice(0, pathArr.length - 1).join('/')}/${newFileName}`;
      await axios.put(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/contents/${newFilePath}`, {
        message: 'Rename new resource file in {date}-{type}-{title} format',
        content,
        branch: BRANCH_REF,
      }, { headers });
    }

    // delete resource pages
    for (let i = 0; i < resourcePages.length; i++) {
      const page = resourcePages[i];
      await axios.delete(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/contents/${page.path}`, {
        params: {
          message: `Delete file: ${page.path}`,
          ref: BRANCH_REF,
          sha: page.sha,
        },
        headers,
      });
    }
  } catch (err) {
    console.log(err);
  }
}

// function which wraps the other functions and renames resource room files
async function renameResourceFiles() {
  const resourceRoomName = await getResourceRoomName();
  const { gitTree } = await getTree();
  await retrieveResourceFiles(gitTree, resourceRoomName);
}

// runs the script
(async () => {
  await renameResourceFiles();
})();

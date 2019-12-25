/* eslint-disable no-console */
/* eslint-disable consistent-return */
/* eslint-disable no-plusplus */
// import dependencies required to import files
const yaml = require('js-yaml');
const YAML = require('yamljs');
const { Base64 } = require('js-base64');
const { request } = require('@octokit/request');

// the utils will be dealing with file content only
// posting to repositories will be done through other functions

/*
 *
 * Helper functions
 *
 */


// slugify function
function slugify(name) {
  return name.toString().toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with '-'
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple '-' with single '-'
    .replace(/^-+/, '') // Trim '-' from start of text
    .replace(/-+$/, ''); // Trim '-' from end of text
}

// concatenates front matter to a body of text
function concatFrontMatterMdBody(frontMatter, mdBody) {
  return ['---\n', `${YAML.stringify(frontMatter, { schema: 'core' })}\n`, '---\n', mdBody].join('');
}

// object to yaml converter
// eslint-disable-next-line consistent-return
function objToYaml(yamlObj) {
  try {
    return YAML.stringify(yamlObj, { schema: 'core' });
  } catch (err) {
    console.log(err);
  }
}

// takes yaml file content and returns a yaml object
function yamlParser(file) {
  if (file) return yaml.safeLoad(file);
  return '';
}

// extracts yaml front matter from a markdown file path
function frontMatterParser(markdownFileContent) {
  // format file to extract yaml front matter
  const contents = markdownFileContent.split('---');
  const articleConfig = contents[1];
  const articleContent = contents[2];

  // get the configs
  const frontMatter = yaml.safeLoad(articleConfig);

  return {
    frontMatter,
    mdBody: articleContent,
  };
}

// check if markdown file has front matter
function checkFrontMatter(markdownFileContent) {
  // format file to extract yaml front matter
  const contents = markdownFileContent.split('---');

  if (contents) {
    return (contents[0] === '');
  }
  throw new Error('File is not a valid markdown file!');
}

// takes in markdown file and a javascript object containing new data
// and updates the front matter in the markdown file with the javascript object
function frontMatterInsert(markdownFileContent, newData) {
  const { frontMatter, mdBody } = frontMatterParser(markdownFileContent);

  // change the layout for contact-us page
  if (frontMatter.layout === 'contact-us') {
    frontMatter.layout = 'contact_us';
  }

  // if layout is leftnav-page, leftnav-page-content, or simple-page, we can
  // remove the layout
  if (frontMatter.layout === 'leftnav-page'
    || frontMatter.layout === 'leftnav-page-content'
    || frontMatter.layout === 'simple-page'
    || frontMatter.layout === 'post'
  ) {
    delete frontMatter.layout;
  }
  // remove last-updated, collection_name if present
  if (frontMatter['last-updated']) {
    delete frontMatter['last-updated'];
  }
  if (frontMatter.collection_name) {
    delete frontMatter.collection_name;
  }
  // change second_nav_title to third_nav_title if present
  if (frontMatter.second_nav_title) {
    frontMatter.third_nav_title = frontMatter.second_nav_title;
    delete frontMatter.second_nav_title;
  }

  // add the new data to the config object
  Object.assign(frontMatter, newData);

  // join the components and write the file
  const data = concatFrontMatterMdBody(frontMatter, mdBody);

  return data;
}

// function to check if string is more than 50% integers
function isPhoneNumber(inputString) {
  let numberCount = 0;

  // check each element to see if it's a number
  inputString.split('').forEach((curr) => {
    if (!Number.isNaN(curr)) {
      // increment if number
      numberCount++;
    }
  });
  return numberCount / inputString.length > 0.5;
}

// function to check if string is email
function isEmail(email) {
  // regex to test for email validity
  const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  // split by space and check if the first element is an email
  return re.test(email.split(' ')[0]);
}

// function to check if a line in contact-us.yml is
// a phone number
// an email
// others
function contactUsLineChecker(line) {
  if (isPhoneNumber(line)) {
    return {
      phone: line,
    };
  }

  if (isEmail(line)) {
    return {
      email: line.replace(' (email)', ''),
    };
  }


  return {
    other: line,
  };
}

// function to check if a character is an alphabet
function isLetter(c) {
  return c.toLowerCase() !== c.toUpperCase();
}

/*
 *
 * Github API Tools
 *
 */
async function getGithubFiles(repoToMigrate, pathString, header) {
  const res = await request('GET /repos/:owner/:repo/contents/:path', {
    owner: 'isomerpages',
    repo: repoToMigrate,
    path: pathString,
    branch: 'v2Migration',
    headers: header,
  });

  return res;
}

async function getFileFromGithub(header, repoName, filePath) {
  try {
    // get branch SHA
    const data = await request('GET /repos/:owner/:repo/contents/:path', {
      owner: 'isomerpages',
      repo: repoName,
      path: filePath,
      ref: 'v2Migration',
      headers: header,
    });

    return {
      content: Base64.decode(data.data.content),
      sha: data.data.sha,
      path: filePath,
    };
  } catch (err) {
    console.log(err);
    return {
      content: null,
      sha: null,
      path: null,
    };
  }
}

async function updateFileOnGithub(header, repoName, filePath, content, sha) {
  try {
    const data = await request('PUT /repos/:owner/:repo/contents/:path', {
      owner: 'isomerpages',
      repo: repoName,
      branch: 'v2Migration',
      path: filePath,
      content: Base64.encode(content),
      message: 'Updated file as part of migration to Isomer V2 templates',
      sha,
      headers: header,
    });

    return data;
  } catch (err) {
    console.log(err);
  }
}

async function deleteFileOnGithub(header, repoName, filePath, sha) {
  try {
    const data = await request('DELETE /repos/:owner/:repo/contents/:path', {
      owner: 'isomerpages',
      repo: repoName,
      branch: 'v2Migration',
      path: filePath,
      message: 'Deleted file as part of migration to Isomer V2 templates',
      sha,
      headers: header,
    });
    console.log(`Deleted ${filePath}`);
    return data;
  } catch (err) {
    console.log(err);
  }
}

module.exports = {
  slugify,
  concatFrontMatterMdBody,
  objToYaml,
  yamlParser,
  frontMatterParser,
  frontMatterInsert,
  checkFrontMatter,
  contactUsLineChecker,
  isLetter,
  getCollectionsObj,
  getGithubFiles,
  getFileFromGithub,
  updateFileOnGithub,
  deleteFileOnGithub,
};

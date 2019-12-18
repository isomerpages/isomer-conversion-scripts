// import dependencies
const { request } = require('@octokit/request')
const btoa = require('btoa')
const utils = require('./utils')
const migration = require('./migrationTools')

console.log(process.argv)

// Testing repo name
const repoToMigrate = process.argv[2]

// Retrieve env variables
const GITHUB_ORG_NAME = process.env.GITHUB_ORG_NAME
const BRANCH_REF = process.env.BRANCH_REF

// Credentials with generic header
const PERSONAL_ACCESS_TOKEN = process.env.PERSONAL_ACCESS_TOKEN
const USERNAME = process.env.USERNAME
const CREDENTIALS = `${USERNAME}:${PERSONAL_ACCESS_TOKEN}`
const header = {
  authorization: `basic ${btoa(CREDENTIALS)}`,
  accept: 'application/json',
}

// the steps are:
  // 1. create a new branch which forks off staging if it doesn't exist
  // 2. add files
  // 3. modify files
  // 4. delete files
  // 5. modify all existing markdown files

/*

Step 1 - Create a Branch

*/

// Get the SHA of the staging branch
async function getStagingSHA (repoName) {
  try {
    // get branch SHA
    const data = await request('GET /repos/:owner/:repo/branches/:branch', {
      owner: GITHUB_ORG_NAME,
      repo: repoName,
      branch: BRANCH_REF,
      headers: {
        authorization: `basic ${btoa(CREDENTIALS)}`,
        accept: 'application/json',
      },
    })

    // return the SHA
    return data.data.commit.sha
  } catch(err) {
    console.log(err) 
  }
}

// Create a new branch v2Migration
  // reference: https://stackoverflow.com/questions/9506181/github-api-create-branch
async function createBranchFunction (repoName, branchName) {
  try {
    // create branch 
    const data = await request('POST /repos/:owner/:repo/git/refs', {
      owner: GITHUB_ORG_NAME,
      repo: repoName,
      ref: `refs/heads/${branchName}`,
      sha: await getStagingSHA(repoName),
      headers: {
        authorization: `basic ${btoa(CREDENTIALS)}`,
        accept: 'application/json',
      },
    })

    return data
  } catch (err) {
    console.log(err)
    return {
      message: 'error creating branch',
      err
    }
  }
}

async function deleteBranchFunction (repoName, branchName) {
  try {
    // delete branch 
    const data = await request('DELETE /repos/:owner/:repo/git/refs/:ref', {
      owner: GITHUB_ORG_NAME,
      repo: repoName,
      ref: `heads/${branchName}`,
      headers: {
        authorization: `basic ${btoa(CREDENTIALS)}`,
        accept: 'application/json',
      },
    })

    return data
  } catch(err) {
    return {
      message: 'error deleting branch',
      err,
    }
  }
}

async function createMigrationBranch (repoName=repoToMigrate, branchName='v2Migration') {
  let res
  try {
    // create branch
    res = await createBranchFunction(repoName, branchName)
  

    if (res.status === 201) {
      console.log('v2Migration branch successfully created')
      return 

      // otherwise delete branch first then create
    } else {
      console.log('Error creating branch - branch probably already exists')
      deleteBranchFunction(repoName, branchName)
      res = await createBranchFunction(repoName, branchName)
      if (res.status === 201) {
        console.log('v2Migration branch successfully created')
      }
      return
    }
  } catch(err) {
    console.log(err)
  }
}

async function migrate () {
/*

Intermediary step - get necessary files for manipulation

*/
  const config = await utils.getFileFromGithub(header, repoToMigrate, '_config.yml')
  const homepage = await utils.getFileFromGithub(header, repoToMigrate, '_data/homepage.yml')
  const navigation = await utils.getFileFromGithub(header, repoToMigrate, '_data/navigation.yml')
  const contactUs = await utils.getFileFromGithub(header, repoToMigrate, '_data/contact-us.yml')
  const careersStories = await utils.getFileFromGithub(header, repoToMigrate, '_data/careers-stories.yml')
  const products = await utils.getFileFromGithub(header, repoToMigrate, '_data/products.yml')
  const programmes = await utils.getFileFromGithub(header, repoToMigrate, '_data/programmes.yml')
  const resources = await utils.getFileFromGithub(header, repoToMigrate, '_data/resources.yml')
  const socialMedia = await utils.getFileFromGithub(header, repoToMigrate, '_data/social-media.yml')
  const privacyMd = await utils.getFileFromGithub(header, repoToMigrate, 'pages/privacy.md')
  const termsMd = await utils.getFileFromGithub(header, repoToMigrate, 'pages/terms-of-use.md')
  const contactUsMd = await utils.getFileFromGithub(header, repoToMigrate, 'pages/contact-us.md')
  const indexMd = await utils.getFileFromGithub(header, repoToMigrate, 'index.md')
/*

Step 2 - Add files

*/
  // upload footer.yml
  const footer = await migration.footerGenerator(utils.yamlParser(config.content), utils.frontMatterParser(privacyMd.content).frontMatter, utils.frontMatterParser(termsMd.content).frontMatter, utils.frontMatterParser(contactUsMd.content).frontMatter, utils.yamlParser(socialMedia.content)) 
  const uploadFooter = await utils.updateFileOnGithub(header, repoToMigrate, '_data/footer.yml', footer)
  if (uploadFooter.status === 201) console.log('footer.yml was created')

  // upload collections.yml
  // const collections = await migration.collectionsGenerator(utils.yamlParser(navigation.content), repoToMigrate, header) 
  // const uploadCollections = await utils.updateFileOnGithub(header, repoToMigrate, '_data/collections.yml', collections)
  // if (uploadCollections.status === 201) console.log('collections.yml was created')

  
/*

Step 3 - Modify files

*/

  // modify _config.yml file
  const configResults = await migration.configYmlModifier(utils.yamlParser(config.content), utils.yamlParser(homepage.content), utils.yamlParser(navigation.content))
  const newConfigFile = utils.objToYaml( await configResults.confObj)
  const uploadConfig = await utils.updateFileOnGithub(header, repoToMigrate, '_config.yml', newConfigFile, config.sha)
  if (uploadConfig.status === 200) console.log('_config.yml was updated') 

  // modify navigation.yml
  const newNavFile = await migration.navYmlModifier(utils.yamlParser(homepage.content), utils.yamlParser(navigation.content))
  const uploadNav = await utils.updateFileOnGithub(header,repoToMigrate, '_data/navigation.yml', newNavFile, navigation.sha)
  if (uploadNav.status === 200) console.log('navigation.yml was updated') 

  // modify index.md
  const newIndexFile = await migration.indexModifier(configResults.homepageFields, utils.yamlParser(homepage.content), utils.yamlParser(programmes.content), indexMd.content)
  const uploadIndex = await utils.updateFileOnGithub(header, repoToMigrate, 'index.md', newIndexFile, indexMd.sha)
  if (uploadIndex.status === 200) console.log('index.md was updated') 

  // modify contact-us.md
  const contactUsResults = await migration.contactUsModifier(utils.yamlParser(contactUs.content), contactUsMd.content)
  const uploadContactUs = await utils.updateFileOnGithub(header, repoToMigrate, 'pages/contact-us.md', contactUsResults, contactUsMd.sha)
  if (uploadContactUs.status === 200) console.log('contact-us.md was updated') 

/*

Step 4 - Remove files

*/
  const pagesToDel = [homepage, contactUs, careersStories, products, programmes, resources, socialMedia]
  // since async doesn't work with forEach
  for (const page of pagesToDel) {
    if (page) {
      await utils.deleteFileOnGithub(header, repoToMigrate, page.path, page.sha)
    }
  }
}



// Loop through all folders in a repository

// TO-DO: MODIFY ALL MD FILES
async function getRepoContents (pathString) {
  /*
  @orgName the organization's name as a string (case-sensitive)
  @username is the user's Github username as a string (case-sensitive)
  */
  try {
    const data = await request('GET /repos/:owner/:repo/contents/:path', {
      owner: GITHUB_ORG_NAME,
      repo: repoToMigrate,
      path: pathString,
      branch: 'v2Migration',
      headers: header,
    })


    // run a recursive search over all the files - insert a try catch around the get and update functions
    for (const file of await data.data) {
      // the files we want to modify are:
        // files, not folders
        // markdown files which have front matter

      // boolean that says whether file is a markdown file
      const isMd = await file.name.split('.')[file.name.split('.').length - 1] === 'md'

      if (file.type === 'dir') {
        console.log(await file.path)
        await getRepoContents(file.path)
      }

      else if (file.type === 'file' && isMd) {
        // check file for whether it has front matter
        try {
          const { content, sha } = await utils.getFileFromGithub(header, repoToMigrate, file.path)
          if (utils.checkFrontMatter(await content)) {
            // put them through front matter insert to remove unncessary fields
            const res = await utils.frontMatterInsert(content, {})
            // update the file
            await utils.updateFileOnGithub(header, repoToMigrate, file.path, res, sha)
          }
          console.log(await file.path)
        } catch (err) {
          console.log(err)
        }
      }
    }

  } catch (err) {
      // *** log error - to do: develop more sophisticated error detection techniques
      console.log('No further child files')
  }
}


/* 

Execute functions

*/

async function test() {
  try {
    await createMigrationBranch()
    await migrate()
    await getRepoContents('')
  } catch (err) {
    console.log(err)
  }
 }

test()

module.exports = {
  CREDENTIALS,
  header,
}
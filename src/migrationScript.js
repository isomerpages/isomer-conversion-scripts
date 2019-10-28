// import dependencies
const { request } = require('@octokit/request')
const btoa = require('btoa')
const utils = require('./utils')
const migration = require('./migrationTools')

// Testing repo name
const testingRepo = 'isomerpages-govtech'

// Credentials with generic header
const PERSONAL_ACCESS_TOKEN = process.env['KWAJIEHAO_PERSONAL_ACCESS_TOKEN'] // kwajiehao personal access token
const USERNAME = 'kwajiehao' // user account which possesses the power to perform permissioned actions
const CREDENTIALS = `${USERNAME}:${PERSONAL_ACCESS_TOKEN}`
const header = {
  authorization: `basic ${btoa(CREDENTIALS)}`,
  accept: 'application/json',
}

// currently repo is hardcoded

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
      owner: 'isomerpages',
      repo: repoName,
      branch: 'staging',
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
      owner: 'isomerpages',
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
      owner: 'isomerpages',
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

async function createMigrationBranch (repoName=testingRepo, branchName='v2Migration') {
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
  const config = await utils.getFileFromGithub(header, testingRepo, '_config.yml')
  const homepage = await utils.getFileFromGithub(header, testingRepo, '_data/homepage.yml')
  const navigation = await utils.getFileFromGithub(header, testingRepo, '_data/navigation.yml')
  const contactUs = await utils.getFileFromGithub(header, testingRepo, '_data/contact-us.yml')
  const careersStories = await utils.getFileFromGithub(header, testingRepo, '_data/careers-stories.yml')
  const products = await utils.getFileFromGithub(header, testingRepo, '_data/products.yml')
  const programmes = await utils.getFileFromGithub(header, testingRepo, '_data/programmes.yml')
  const resources = await utils.getFileFromGithub(header, testingRepo, '_data/resources.yml')
  const socialMedia = await utils.getFileFromGithub(header, testingRepo, '_data/social-media.yml')
  const privacyMd = await utils.getFileFromGithub(header, testingRepo, 'pages/privacy.md')
  const termsMd = await utils.getFileFromGithub(header, testingRepo, 'pages/terms-of-use.md')
  const contactUsMd = await utils.getFileFromGithub(header, testingRepo, 'pages/contact-us.md')
  const indexMd = await utils.getFileFromGithub(header, testingRepo, 'index.md')
/*

Step 2 - Add files

*/
  // upload footer.yml
  const footer = await migration.footerGenerator(utils.yamlParser(config.content), utils.frontMatterParser(privacyMd.content).frontMatter, utils.frontMatterParser(termsMd.content).frontMatter, utils.frontMatterParser(contactUsMd.content).frontMatter, utils.yamlParser(socialMedia.content)) 
  const uploadFooter = await utils.updateFileOnGithub(header, testingRepo, '_data/footer.yml', footer)
  if (uploadFooter.status === 201) console.log('footer.yml was created') 
  
/*

Step 3 - Modify files

*/

  // modify _config.yml file
  const configResults = await migration.configYmlModifier(utils.yamlParser(config.content), utils.yamlParser(homepage.content), utils.yamlParser(navigation.content))
  const newConfigFile = utils.objToYaml( await configResults.confObj)
  const uploadConfig = await utils.updateFileOnGithub(header, testingRepo, '_config.yml', newConfigFile, config.sha)
  if (uploadConfig.status === 200) console.log('_config.yml was updated') 

  // modify navigation.yml
  const navResults = await migration.navYmlModifier(utils.yamlParser(homepage.content), utils.yamlParser(navigation.content))
  const newNavFile = utils.objToYaml( await navResults)
  const uploadNav = await utils.updateFileOnGithub(header,testingRepo, '_data/navigation.yml', newNavFile, navigation.sha)
  if (uploadNav.status === 200) console.log('navigation.yml was updated') 

  // modify index.md
  const newIndexFile = await migration.indexModifier(configResults.homepageFields, utils.yamlParser(homepage.content), utils.yamlParser(programmes.content), indexMd.content)
  const uploadIndex = await utils.updateFileOnGithub(header, testingRepo, 'index.md', newIndexFile, indexMd.sha)
  if (uploadIndex.status === 200) console.log('index.md was updated') 

  // modify contact-us.md
  const contactUsResults = await migration.contactUsModifier(utils.yamlParser(contactUs.content), contactUsMd.content)
  const uploadContactUs = await utils.updateFileOnGithub(header, testingRepo, 'pages/contact-us.md', contactUsResults, contactUsMd.sha)
  if (uploadContactUs.status === 200) console.log('contact-us.md was updated') 

/*

Step 4 - Remove files

*/
  const pagesToDel = [homepage, contactUs, careersStories, products, programmes, resources, socialMedia]
  // since async doesn't work with forEach
  for (const page of pagesToDel) {
    if (page) {
      await utils.deleteFileOnGithub(header, testingRepo, page.path, page.sha)
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
      owner: 'isomerpages',
      repo: testingRepo,
      path: pathString,
      headers: header,
    })

    // run a recursive search over all the files - insert a try catch around the get and update functions
    for (const file of data.data) {
      // the files we want to modify are:
        // files, not folders
        // markdown files which have front matter

        // boolean that says whether file is a markdown file
        const isMd = file.name.split('.')[file.name.split('.').length - 1] === 'md'
        if (file.type === 'file' && isMd) {
          // check file for whether it has front matter
          try {
            const { content, sha } = await utils.getFileFromGithub(header, testingRepo, file.path)
            if (utils.checkFrontMatter(content)) {
              // put them through front matter insert to remove unncessary fields
              const res = await utils.frontMatterInsert(content, {})
              // update the file 
              // CURRENTLY HAVING PROBLEMS HERE
              await utils.updateFileOnGithub(header, testingRepo, file.path, res, sha) 
            }
          } catch (err) {
            console.log(err)
          }
        } 
  
        if (file.type === 'dir') {
          getRepoContents(`${pathString}/${file.path}`) // check again the path of file.path to see whether this needs to be reformatted
        }
    }

    return data
    /*

        Here we can experiment with inviting through email instead of userId

    */
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
    // getRepoContents('')
  } catch (err) {
    console.log(err)
  }
 }

// test()
getRepoContents('')
module.exports = {
  CREDENTIALS,
  header,
}
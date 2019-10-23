// Procedure to modify files
  // Create a new staging branch staging-next-gen
    // locally, we will just copy the directory
  // Add new files
    // footer.yml
  // Modify files
    // _config.yml
    // navigation.yml
    // contact-us.md
    // index.md
  // Remove files
    // homepage.yml
    // contact-us.yml
    // careers-stories.yml
    // products.yml
    // programmes.yml
    // resources.yml
    // social-media.yml

// This script will, given a repository/folder's path, 
// loop through all files and modify them accordingly

// import dependencies 
const conversionTools = require('./localUtils')
const execSync = require('child_process').execSync

// store the repository's absolute path from command line args
const repoPath = process.argv[2]
const newRepo = `${repoPath}-copy`

// make checks on the argument to ensure it's an absolute path
if (!repoPath.match(/^\/([A-z0-9-_+]+\/)*([A-z0-9-_+]+)((\.).+)?$/)) {
  console.log('Please enter a valid absolute path')
  return
}

// make checks on structure of repo - optional

const runScript = function () {
  // run bash code to delete copied repo if it exists
  execSync(`rm -rf ${newRepo}`)

  // run bash code to copy repo
  execSync(`cp -R ${repoPath} ${newRepo}`)
  
  // get a list of files
  const result = execSync(`cd ${newRepo}; ls`).toString().split('\n')

  // if there is a README.md, print it
  // result.forEach( curr => {
  //   if (curr === 'README.md') {
  //     // use stdio to print output to node console
  //     execSync(`cat ${newRepo}/README.md`, {stdio: 'inherit'})
  //   }
  // })

  /*
  1. add new files
  */
  conversionTools.footerGenerator(newRepo, `${newRepo}/_config.yml`, `${newRepo}/pages/privacy.md`, `${newRepo}/pages/terms-of-use.md`, `${newRepo}/pages/contact-us.md`, `${newRepo}/_data/social-media.yml`)

  /*
    2. modify files
  */

  // modify config file
  const config = conversionTools.configYmlModifier(`${newRepo}/_config.yml`, `${newRepo}/_data/homepage.yml`,  `${newRepo}/_data/navigation.yml`)
  conversionTools.objToYaml(`${newRepo}/_config.yml`, config.confObj)

  // modify index.md
  conversionTools.indexModifier(config.homepageFields, `${newRepo}/_data/homepage.yml`, `${newRepo}/_data/programmes.yml`, `${newRepo}/index.md`)

  // modify contact-us
  conversionTools.contactUsModifier(`${newRepo}/_data/contact-us.yml`, `${newRepo}/pages/contact-us.md`)

  // modify navigation.yml
  conversionTools.navigationModifier(`${newRepo}/_data/homepage.yml`, `${newRepo}/_data/navigation.yml`)

  /*
    3. remove files
  */
  const pagesToDel = ['homepage.yml', 'contact-us.yml', 'careers-stories.yml', 'products.yml', 'programmes.yml', 'resources.yml', 'social-media.yml']
  pagesToDel.forEach(curr => {
    // remove all the above files 
    execSync(`rm -rf ${newRepo}/_data/${curr}`)
  })

  /*
    4. Modify all existing markdown files
  */
    
  // only touch files that
    // end with .md
    // have front matter
    // exceptions

  // folders not to touch
    // _data
    // _includes
    // _layouts
}

// we will use recursion to loop through all folders
const loopThroughDirectory = function(directory) {
  
  // list all markdown files
  const markdownFiles = execSync(`cd ${directory}; ls *.md || echo 'there are no markdown files'`).toString().split('\n')
  if (markdownFiles[0] !== 'there are no markdown files') {
    if (markdownFiles) {
      // run each markdown file through front matter insert
      markdownFiles.forEach( curr => {
        // make sure that the file exists, and it ends with md
        if (curr && curr.split('.')[curr.split('.').length - 1] === 'md') {
          // check whether it has front matter
            // since we only want to edit files with front matter
          if (conversionTools.checkFrontMatter(`${directory}/${curr}`)) {
            conversionTools.frontMatterInsert(`${directory}/${curr}`, {})
          }
        }
      })
    }
  }


  // list all folders 
  const folders = execSync(`cd ${directory}; ls -d */ || echo 'there are no folders'`).toString().split('\n')
  if (folders[0] !== 'there are no folders') {
    if (folders) {
      // recursively call loopThroughDirectory
      folders.forEach( curr => {
        if (curr) {
          // recursive call through the remaining directories in the folder
          loopThroughDirectory(`${directory}/${curr}`)
        }
      })
    } 
  }
  

  return
  
}

runScript()
loopThroughDirectory(newRepo)

// import dependencies
const { request } = require('@octokit/request')
const btoa = require('btoa')


// Credentials
const PERSONAL_ACCESS_TOKEN = process.env['KWAJIEHAO_PERSONAL_ACCESS_TOKEN'] // kwajiehao personal access token
const USERNAME = 'kwajiehao' // user account which possesses the power to perform permissioned actions
const CREDENTIALS = `${USERNAME}:${PERSONAL_ACCESS_TOKEN}`

// currently repo is hardcoded


// get all folders in a repository
async function getRepoContents (pathString) {
  /*
  @orgName the organization's name as a string (case-sensitive)
  @username is the user's Github username as a string (case-sensitive)
  */
  try {
    const data = await request('GET /repos/:owner/:repo/contents/:path', {
      owner: 'isomerpages',
      repo: 'isomerpages-govtech',
      path: pathString,
      headers: {
        authorization: `basic ${btoa(CREDENTIALS)}`,
        accept: 'application/vnd.github.dazzler-preview+json',
      },
    })

    console.log(data.data)

    // run a recursive search over all the files
    data.data.forEach( curr => {
      console.log(curr.name)
      // console.log('\n')
      if (curr.type === 'file') {

      } 

      if (curr.type === 'dir') {
        getRepoContents(`${path}/${curr.path}`)
      }
    })

    return data
    /*

        Here we can experiment with inviting through email instead of userId

    */
  } catch (err) {
      // *** log error - to do: develop more sophisticated error detection techniques
      console.log(err)
  }
}

getRepoContents('')
  
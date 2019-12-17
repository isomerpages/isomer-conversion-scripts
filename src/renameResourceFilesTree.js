// note that this script does not work completely - it fails to 
// delete the existing file when renaming it in the git directory. 
// this is because not only must the file in the git directory be
// renamed, all ancester folders (or subtrees) that it belongs to
// must be modified as well.

const axios = require('axios')
const btoa = require('btoa')
const yaml = require('js-yaml')
const base64 = require('base-64')
const slugify = require('slugify')
const Bluebird = require('bluebird')

// name of repo
const REPO = process.argv[2]

// constants
const GITHUB_ORG_NAME = process.env.GITHUB_ORG_NAME
const BRANCH_REF = process.env.BRANCH_REF

// credentials with generic header
const PERSONAL_ACCESS_TOKEN = process.env.PERSONAL_ACCESS_TOKEN
const USERNAME = process.env.USERNAME
const CREDENTIALS = `${USERNAME}:${PERSONAL_ACCESS_TOKEN}`
const headers = {
  Authorization: `Basic ${btoa(CREDENTIALS)}`,
  Accept: 'application/json',
}

// get resource room name
async function getResourceRoomName() {
    try {
        const endpoint = `https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/contents/_config.yml`

        const resp = await axios.get(endpoint, {
            params: {
                "ref": BRANCH_REF,
            },
            headers,
        })

        if (resp.status === 404) throw new Error ('Page does not exist')

        // parse response to get resource room name
        const { content } = resp.data
        const contentObject = yaml.safeLoad(base64.decode(content))
        if (contentObject.resources_name) {
            return contentObject.resources_name
        } else {
            throw new Error ('Resource room does not exist')
        }
    } catch (err) {
        console.log(err)
    }
}

// retrieve the tree item
async function getTree() {
    try {
        // Get the commits of the repo
        const { data: commits } = await axios.get(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/commits`, {
            params: {
                "ref": BRANCH_REF,
            },
            headers,
        })
        // Get the tree sha of the latest commit
        const { commit: { tree: { sha: treeSha } } } = commits[0]
        const currentCommitSha = commits[0].sha

        const { data: { tree: gitTree } } = await axios.get(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/git/trees/${treeSha}?recursive=1`, {
            params: {
                "ref": BRANCH_REF,
            },
            headers
        })

        return { gitTree, currentCommitSha };
    } catch (err) {
        console.log(err)
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

// parse the tree and modify it
async function modifyTreeResourcePages(gitTree, resourceRoomName) {
    try {
        // separate resource pages from non resource pages
        const resourcePages = []
        const nonResourcePages = []
        // retrieve markdown pages in resource directories
        gitTree.forEach((curr) => {
            const { path, type } = curr
            // only look at files within resources
            // only look at markdown pages, not directories
            if (path.split('/')[0] === resourceRoomName && path.split('.')[path.split('.').length - 1] === 'md' && path.split('/').length === 4) {
                resourcePages.push(curr)
            } else {
                nonResourcePages.push(curr)
            }
        })

        // retrieve resource page data
        const resourcePageData = await Bluebird.map(resourcePages, (page) => {
            return axios.get(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/contents/${page.path}`, {
                params: {
                    "ref": BRANCH_REF,
                },
                headers,
            })
        })

        // delete resource pages
        // await Bluebird.map(resourcePages, (page) => {
        //     return axios.delete(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/contents/${page.path}`, {
        //         params: {
        //             "message": `Delete file: ${page.path}`,
        //             "ref": BRANCH_REF,
        //             "sha": page.sha,
        //         },
        //         headers,
        //     })
        // })

        /*
        * Renames all resource files in the correct {date}-{category}-{title} format
        */
        for (let i = 0; i < resourcePages.length; ++i) {
            // get attributes from github response
            const { data: { content, path } }  = resourcePageData[i]
            const decodedContent = yaml.safeLoad(base64.decode(content).split('---')[1]);
            const { date, title } = decodedContent

            // split the path 
            const pathArr = path.split('/')
            const resourceRoomNameIndex = pathArr.findIndex(element => element === resourceRoomName);
            const type = pathArr[resourceRoomNameIndex + 2].slice(1)

            const dateType = typeof date
            let computedDate

            // compute the date
            if (dateType === 'object') {
                computedDate = `${date.getFullYear()}-${minTwoDigits(date.getMonth())}-${minTwoDigits(date.getDate())}`
            } else if (dateType === 'string') {
                computedDate = date
            }

            // get the resource category
            const newFileName = generateResourceFileName(title, type, computedDate)
            resourcePages[i].path = `${pathArr.slice(0, pathArr.length - 1).join('/')}/${newFileName}`
        }

        const newTree = [...resourcePages, ...nonResourcePages]
        return newTree 
        // since they are not allowed to have forward slashes in their title,
        // we can split on forward slash
    } catch (err) {
        console.log(err)
    }
}


// send the new tree object back to Github and point the latest commit on the staging branch to it
async function sendTree(gitTree, currentCommitSha) {
    const { data: { sha: newTreeSha } } = await axios.post(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/git/trees`, {
        tree: gitTree,
      }, {
        headers,
      })
  
    const baseRefEndpoint = `https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/git/refs`
    const baseCommitEndpoint = `https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/git/commits`
    const refEndpoint = `${baseRefEndpoint}/heads/${BRANCH_REF}`

    const newCommitResp = await axios.post(baseCommitEndpoint, {
        message: `Rename resource page files to {date}-{category}-{title} format`,
        tree: newTreeSha,
        parents: [currentCommitSha]
    }, {
        headers,
    })

    const newCommitSha = newCommitResp.data.sha

    /**
     * The `staging` branch reference will now point
     * to `newCommitSha` instead of `currentCommitSha`
     */
    await axios.patch(refEndpoint, {
        sha : newCommitSha
    }, {
        headers,
    })
}


// function which wraps the other functions and renames resource room files
async function renameResourceFiles() {
    const resourceRoomName = await getResourceRoomName()
    const { gitTree, currentCommitSha } = await getTree()
    const newGitTree = await modifyTreeResourcePages(gitTree, resourceRoomName)
    await sendTree(newGitTree, currentCommitSha)
}

// runs the script
(async () => {
    await renameResourceFiles()
})()
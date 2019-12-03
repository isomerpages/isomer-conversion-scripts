const axios = require('axios')
const btoa = require('btoa')
const yaml = require('js-yaml')
const base64 = require('base-64')
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

        const { data: { tree: gitTree } } = await axios.get(`https://api.github.com/repos/${GITHUB_ORG_NAME}/${REPO}/git/trees/${treeSha}?recursive=1`, {
            params: {
                "ref": BRANCH_REF,
            },
            headers
        })

        return { gitTree };
    } catch (err) {
        console.log(err)
    }
}

// function which slugifies the file name
function generateResourceFileName(title, type, date) {
    const safeTitle = slugify(title).replace(/[^a-zA-Z-]/g, '');
    return `${date}-${type}-${safeTitle}.md`;
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
            if (path.split('/')[0] === resourceRoomName && path.split('.')[path.split('.').length - 1] === 'md') {
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

        for (let i = 0; i < resourcePages.length; ++i) {
            const { data: { content, path } }  = resourcePageData[i]
            const { date, title } = yaml.safeLoad(base64.decode(content).split('---')[1]);
            // get the resource category
            const type = 'category'
            const newFileName = generateResourceFileName(title, type, date)
            resourcePages[i].path = `${path.split('/').slice(0, path.split('/').length - 2).join('/')}/${newFileName}`
            console.log(title)
        }

        console.log('abc')
        return [...resourcePages, ...nonResourcePages]
        // since they are not allowed to have forward slashes in their title,
        // we can split on forward slash
    } catch (err) {
        console.log(err)
    }
}

/*
* Renames all resource files in the correct {date}-{category}-{title} format
*/
// async function renameResourcePages(resourceRoomName, repo, pathstring, headers) {

//     try {
      
  
//     } catch (err) {
//         console.log(err)
//     }
// }

(async () => {
    const res = await getResourceRoomName()
    const res2 = await getTree()
    const res3 = await modifyTreeResourcePages(res2.gitTree, res)
    console.log(res)
})()
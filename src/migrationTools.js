const utils = require('./utils')
/*
 * 
 * Conversion Tools
 * 
 */

// add a footer.yml file
function footerGenerator(confObj, privacyFrontMatter, termsFrontMatter, contactUsFrontMatter, socialMediaObj) {
  var footer = {
    'show_reach': true,
    'copyright_agency': 'Open Government Products',
  }

  if (contactUsFrontMatter) {
    footer['contact_us'] = contactUsFrontMatter.permalink
  }


  if (confObj) {
    footer['faq'] = confObj['faq_url']
    footer['feedback'] = confObj['feedback_form_url']
  }

  if (privacyFrontMatter) {
    footer['privacy'] = privacyFrontMatter.permalink
  }

  if (termsFrontMatter) {
    footer['terms_of_use'] = termsFrontMatter.permalink
  }

  if (socialMediaObj) {
    footer['social_media'] = socialMediaObj
  }

  // return footer
  return utils.objToYaml(footer)
}

// modify the _config.yml file to fit V2 standards
// takes in parsed yml objects, NOT file paths
function configYmlModifier (confObj, homepageObj, navigationObj) {
  // separate the homepage fields
  const homepageFields = {
    'i_want_to': confObj['homepage_hero_i_want_to'],
    'programmes': confObj['homepage_programmes'],
    'resources': confObj['homepage_resources'],
    'careers': confObj['homepage_careers'],
  }

  // fields to remove
  const toRemove = [
    'title-abbreviated', 
    'email', 
    'baseurl', 
    'markdown', 
    'twitter_username', 
    'github_username', 
    'breadcrumbs', 
    'faq_url', 
    'faq_url_external', 
    'feedback_form_url',
    'homepage_hero_i_want_to',
    'homepage_programmes',
    'homepage_resources',
    'homepage_careers',
  ]
  toRemove.forEach(el => delete confObj[el])

  // fields to add
  Object.assign(confObj, {
    favicon: homepageObj.favicon,
    'google-analytics': homepageObj['google-analytics'],
    'remote_theme': 'isomerpages/isomerpages-template@next-gen',
    permalink: 'none',
    baseurl: '',
    defaults: [
      {
        'scope': { path: '' }, 
        'values': { layout: 'page' }, 
      }
    ]
  })

  // fields to modify
    // according to V2 migration guide, need to modify CSS but correct
    // information not reflected in repo
  confObj['plugins'] = ['jekyll-feed', 'jekyll-assets', 'jekyll-paginate', 'jekyll-sitemap']

  // permalink template
  const permalinkTemplate = '/:collection/:path/:title'

  // add permalink template to each collection if they can be found in navigation.yml
  if (confObj['collections']) {
    const collectionKeys = Object.keys(confObj['collections'])

    // loop through titles in navigation yml file
    navigationObj.map(navObj => {
      // match them with collection titles
      collectionKeys.map(el => {
        if (utils.slugify(navObj['title']) === el) {
          confObj['collections'][el]['permalink'] = permalinkTemplate
        } 
      })
    })
  }

  return {
    confObj,
    homepageFields,
  }
}

// modifies the navigation.yml file
function navYmlModifier(homepageObj, navigationObj) {
  // get the agency logo
  const logo = homepageObj['agency-logo']

  // get the resources room title
  const resourcesTitle = homepageObj['resources-title']

  // modifications to objects in navigation.yml
  navigationObj = navigationObj.map(el => {
    // modify resource room object
    if (el['title'] === resourcesTitle) {
      return {
        title: resourcesTitle,
        resource_room: true,
      }

      // if it has sublinks, we need to determine if it is a collection or not
    } else if (el['sub-links']) {
      if (el['false_collection'] === true) {
        // rename sub-links to sublinks
        el['sublinks'] = el['sub-links']
      } else {
        el['collection'] = utils.slugify(el['title'])
      }

      // delete sub-links attribute
      delete el['sub-links']
    }

    return el
  })

  const res = {
    logo,
    links: navigationObj
  }
  // return the new navigation file
  return utils.objToYaml(res)
}

// modifies the contact-us.md page so that it includes the new front matter
function contactUsModifier(contactUsObj, contactUsMarkdown) {  
  if (contactUsObj['column']) {
    // change attribute from column to contacts
    contactUsObj['contacts'] = contactUsObj['column']

    // within contacts and content, replace lines with phone, email, and other
    contactUsObj['contacts'].forEach( curr => {
      if (curr['content']) {
        // replace individual elements in content
        curr['content'] = curr['content'].map( ele => {
          // check if it's a phone number or email
          return utils.contactUsLineChecker(ele['line'])
        })
      }
    })

    // remove column
    delete contactUsObj['column']
  }
  
  if (contactUsObj['locations']) {
    contactUsObj['locations'].forEach( curr => {
      // replace operating-hours with operating_hours and delete original
      if (curr['operating-hours']) {
        curr['operating_hours'] = curr['operating-hours']
        delete curr['operating-hours']
      }
  
      // split location address into different lines
      curr['address'] = curr['address'].split('<br>')
    })
  }

  // update the front matter
  return utils.frontMatterInsert(contactUsMarkdown, contactUsObj)
}

// modify index.md file, which requires homepageModifier
function indexModifier(homepageFields, homepageObj, programmesObj, indexMd) {
  // update the homepage yml data
  const newData = homepageModifier(homepageObj, homepageFields, programmesObj)

  // update the front matter
  const res = utils.frontMatterInsert(indexMd, newData) 

  return res
}

// takes in
    // homepage.yml file path
    // homepageFields from _config.yml
    // programmes.yml file path 
// as objects, and returns the relevant data needed to modify index.md's 
// front matter
function homepageModifier(homepageObj, homepageFields, programmesObj) {
  // various empty objects to store results
  var sections = [ { hero: {} } ] 
  var resources = {}
  var carousel = []
  var notification = `This website is in beta - your valuable <a href=\"https://www.google.com\">feedback</a> will help us in improving it.`

  /*
  
  go through the homepage fields

  */

  // i_want_to is now dropdown
  if (homepageFields['i_want_to']) {
    Object.assign(sections[0].hero, {
      'dropdown': {
        'title': homepageObj['hero-dropdown-text'],
        'options': homepageObj['i-want-to'],
      },
    })
  }
  
  // programmes is now infobar
  if (homepageFields['programmes']) {
    sections.push({
      infobar: {
        'title': homepageObj['programmes-title'],
        'subtitle': homepageObj['programmes-subtitle'],
        'description': homepageObj['programmes-description'],
        'button': homepageObj['programmes-more-button'],
        'url': homepageObj['programmes-more-button-url'],
      },
    })
  }

  // info-sections
  if (homepageObj['info-sections']) {
    homepageObj['info-sections'].forEach(curr => {
      sections.push({
        infopic: {
          title: curr['section-title'],
          subtitle: curr['section-subtitle'],
          description: curr['section-description'],
          url: curr['section-more-button-url'],
          image: curr['section-image-path'],
          alt: curr['section-image-alt'],
          button: curr['section-more-button'],
        }
      })
    })
  }

  // carousel
  if (programmesObj) {
    programmesObj.forEach(curr => {
      carousel.push({
        title: curr['title'],
        subtitle: curr['category'],
        description: curr['desc'],
        image: curr['img'],
        'bg-color': curr['bg-color'],
      })
    })
  }
  sections.push({carousel})

  // resources
  if (homepageFields['resources']) {
    Object.assign(resources, {
      'resources': {
        'title': homepageObj['resources-title'],
        'subtitle': homepageObj['resources-subtitle'],
        'button': homepageObj['resources-more-button'],
        'url': homepageObj['resources-more-button-url'],
      },
    })

    sections.push(resources)
  }

  /*
  
  Other miscellaneous additions

  */

  // hero banner
  if (homepageObj['hero-title']){
    Object.assign(sections[0].hero, {
      title: homepageObj['hero-title']
    })
  }

  if (homepageObj['hero-subtitle']){
    Object.assign(sections[0].hero, {
      subtitle: homepageObj['hero-subtitle']
    })
  }

  if (homepageObj['hero-banner']){
    Object.assign(sections[0].hero, {
      background: homepageObj['hero-banner']
    })
  }

  // button
  if (homepageObj['button']) {
    Object.assign(sections[0].hero, {
      button: homepageObj['button'][0]['text'],
      url: homepageObj['button'][0]['url'],
    })
  }

  // key highlights
  if (homepageObj['key-highlights']) {
    Object.assign(sections[0].hero, {
      'key_highlights': homepageObj['key-highlights'],
    })
    
    sections[0].hero['key_highlights'].forEach( curr => {
      if (curr['external']) {
        delete curr['external']
      }
    })
  }
  
  return({
    notification,
    sections
  })
}

module.exports = {
  footerGenerator,
  // collectionsGenerator,
  configYmlModifier,
  navYmlModifier,
  contactUsModifier,
  indexModifier,
}
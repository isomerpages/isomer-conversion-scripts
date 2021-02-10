/* eslint-disable no-param-reassign */
const utils = require('./utils');
/*
 *
 * Conversion Tools
 *
 */

// add a footer.yml file
// eslint-disable-next-line max-len
function footerGenerator(confObj, privacyFrontMatter, termsFrontMatter, contactUsFrontMatter, socialMediaObj) {
  const footer = {
    show_reach: true,
    copyright_agency: 'Open Government Products',
  };

  if (contactUsFrontMatter) {
    footer.contact_us = contactUsFrontMatter.permalink;
  }


  if (confObj) {
    footer.faq = confObj.faq_url;
    footer.feedback = confObj.feedback_form_url;
  }

  if (privacyFrontMatter) {
    footer.privacy = privacyFrontMatter.permalink;
  }

  if (termsFrontMatter) {
    footer.terms_of_use = termsFrontMatter.permalink;
  }

  if (socialMediaObj) {
    footer.social_media = socialMediaObj;
  }

  // return footer
  return utils.objToYaml(footer);
}

// modify the _config.yml file to fit V2 standards
// takes in parsed yml objects, NOT file paths
function configYmlModifier(confObject, homepageObject, navigationObject) {
  const confObj = { ...confObject };
  const homepageObj = { ...homepageObject };
  const navigationObj = { ...navigationObject };

  // separate the homepage fields
  const homepageFields = {
    i_want_to: confObj.homepage_hero_i_want_to,
    programmes: confObj.homepage_programmes,
    resources: confObj.homepage_resources,
    careers: confObj.homepage_careers,
  };

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
  ];
  toRemove.forEach((el) => delete confObj[el]);

  // fields to add
  Object.assign(confObj, {
    favicon: homepageObj.favicon,
    'google_analytics': homepageObj['google-analytics'],
    remote_theme: 'isomerpages/isomerpages-template@next-gen',
    permalink: 'none',
    baseurl: '',
    defaults: [
      {
        scope: { path: '' },
        values: { layout: 'page' },
      },
    ],
  });

  // fields to modify
  // according to V2 migration guide, need to modify CSS but correct
  // information not reflected in repo
  confObj.plugins = ['jekyll-feed', 'jekyll-assets', 'jekyll-paginate', 'jekyll-sitemap'];

  // permalink template
  // const permalinkTemplate = '/:collection/:path/:title';

  // add permalink template to each collection if they can be found in navigation.yml
  // if (confObj.collections) {
  //   const collectionKeys = Object.keys(confObj.collections);

  //   // loop through titles in navigation yml file
  //   Object.values(navigationObj).forEach((navObj) => {
  //     // match them with collection titles
  //     collectionKeys.forEach((el) => {
  //       if (utils.slugify(navObj.title) === el) {
  //         confObj.collections[el].permalink = permalinkTemplate;
  //       }
  //     });
  //   });
  // }

  return {
    confObj,
    homepageFields,
  };
}

// modifies the navigation.yml file
function navYmlModifier(homepageObject, navigationObject) {
  const homepageObj = { ...homepageObject };
  let navigationObj = { ...navigationObject };

  // get the agency logo
  const logo = homepageObj['agency-logo'];

  // get the resources room title
  const resourcesTitle = homepageObj['resources-title'];

  // modifications to objects in navigation.yml
  navigationObj = Object.values(navigationObj).map((el) => {
    // modify resource room object
    if (el.title === resourcesTitle) {
      return {
        title: el.title,
        resource_room: true,
      };
    } 

    // if it has sublinks, we need to determine if it is a collection or not
    if (el['sub-links']) {
      if (el.false_collection === true) {
        // rename sub-links to sublinks
        el.sublinks = el['sub-links'];
      } else {
        el.collection = utils.slugify(el.title);
      }

      // delete sub-links attribute
      delete el['sub-links'];
    }

    // if it's a collection, it doesn't need the url attribute
    if (el.collection) delete el['url']

    return el;
  });

  const res = {
    logo,
    links: navigationObj,
  };
  // return the new navigation file
  return utils.objToYaml(res);
}

// modifies the contact-us.md page so that it includes the new front matter
function contactUsModifier(contactUsObject, contactUsMarkdown) {
  const contactUsObj = { ...contactUsObject };

  if (contactUsObj.column) {
    // change attribute from column to contacts
    contactUsObj.contacts = contactUsObj.column;

    // within contacts and content, replace lines with phone, email, and other
    contactUsObj.contacts.forEach((curr) => {
      if (curr.content) {
        // replace individual elements in content
        curr.content = curr.content.map((ele) => utils.contactUsLineChecker(ele.line));
      }
    });

    // remove column
    delete contactUsObj.column;
  }

  if (contactUsObj.locations) {
    contactUsObj.locations.forEach((curr) => {
      // replace operating-hours with operating_hours and delete original
      if (curr['operating-hours']) {
        curr.operating_hours = curr['operating-hours'];
        delete curr['operating-hours'];
      }

      // if title is not present, default to HQ address
      if (!curr.title && curr.address) curr.title = 'HQ Address'

      // split location address into different lines
      if (curr.address) curr.address = curr.address.split('<br>');
    });
  }

  // update the front matter
  return utils.frontMatterInsert(contactUsMarkdown, contactUsObj);
}

// takes in
// homepage.yml file path
// homepageFields from _config.yml
// programmes.yml file path
// as objects, and returns the relevant data needed to modify index.md's
// front matter
function homepageModifier(homepageObj, homepageFields, notificationContent) {
  // various empty objects to store results
  const sections = [{ hero: {} }];
  const resources = {};

  /*

  go through the homepage fields

  */

  // i_want_to is now dropdown
  if (homepageFields.i_want_to) {
    Object.assign(sections[0].hero, {
      dropdown: {
        title: homepageObj['hero-dropdown-text'],
        options: homepageObj['i-want-to'],
      },
    });
  }

  // programmes is now infobar
  if (homepageFields.programmes) {
    sections.push({
      infobar: {
        title: homepageObj['programmes-subtitle'],
        subtitle: homepageObj['programmes-title'],
        description: homepageObj['programmes-description'],
        button: homepageObj['programmes-more-button'],
        url: homepageObj['programmes-more-button-url'],
      },
    });
  }

  // info-sections
  if (homepageObj['info-sections']) {
    homepageObj['info-sections'].forEach((curr) => {
      sections.push({
        infopic: {
          title: curr['section-subtitle'],
          subtitle: curr['section-title'],
          description: curr['section-description'],
          url: curr['section-more-button-url'],
          image: curr['section-image-path'],
          alt: curr['section-image-alt'] || 'alt text',
          button: curr['section-more-button'],
        },
      });
    });
  }

  // resources
  if (homepageFields.resources) {
    Object.assign(resources, {
      resources: {
        // Title and subtitle are swapped due to an error in the V2 template
        title: homepageObj['resources-subtitle'],
        subtitle: homepageObj['resources-title'],
        button: homepageObj['resources-more-button'],
        url: homepageObj['resources-more-button-url'],
      },
    });

    sections.push(resources);
  }

  /*

  Other miscellaneous additions

  */

  // hero banner
  if (homepageObj['hero-title']) {
    Object.assign(sections[0].hero, {
      title: homepageObj['hero-title'],
    });
  }

  if (homepageObj['hero-subtitle']) {
    Object.assign(sections[0].hero, {
      subtitle: homepageObj['hero-subtitle'],
    });
  }

  if (homepageObj['hero-banner']) {
    Object.assign(sections[0].hero, {
      background: homepageObj['hero-banner'],
    });
  }

  // button
  if (homepageObj.button) {
    Object.assign(sections[0].hero, {
      button: homepageObj.button[0].text,
      url: homepageObj.button[0].url,
    });
  }

  // key highlights
  if (homepageObj['key-highlights']) {
    Object.assign(sections[0].hero, {
      key_highlights: homepageObj['key-highlights'],
    });

    sections[0].hero.key_highlights.forEach((curr) => {
      if (curr.external) {
        delete curr.external;
      }
    });
  }

  const res = {
    sections,
  }

  if (notificationContent) res.notification = notificationContent

  return res;
}

function extractNotificationContent (indexMd) {
  const { mdBody: indexMdContent } = utils.frontMatterParser(indexMd)
  const indexMdContentArr = indexMdContent.split('-->')
  // Assumption: that the substring `-->` is not used in the notification string
  const parsedNotificationContent = indexMdContentArr.length > 1 ? indexMdContentArr[1] : indexMdContentArr[0]
  return parsedNotificationContent
}

// modify index.md file, which requires homepageModifier
function indexModifier(homepageFields, homepageObj, programmesObj, indexMd) {
  // extract notification data if any
  const notificationContent = extractNotificationContent(indexMd)

  // update the homepage yml data
  const newData = homepageModifier(homepageObj, homepageFields, notificationContent);

  // update the front matter
  const isIndex = true
  const res = utils.frontMatterInsert(indexMd, newData, isIndex);

  return res;
}

module.exports = {
  footerGenerator,
  configYmlModifier,
  navYmlModifier,
  contactUsModifier,
  indexModifier,
};

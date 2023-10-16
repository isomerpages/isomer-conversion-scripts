import { JSDOM } from "jsdom";
import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { errorMessage } from "./errorMessage";
import { LOGS_FILE } from "./constants";

type TagAttribute<T extends "a" | "img"> = T extends "a"
  ? { tagName: "a"; attribute: "href" }
  : { tagName: "img"; attribute: "src" };
export async function modifyTagAttribute({
  dom,
  tagAttribute: { tagName, attribute },
  changedPermalinks,
  fileContent,
  setOfAllDocumentsPath,
  currentRepoName,
}: {
  dom: JSDOM;
  tagAttribute: TagAttribute<"a" | "img">;
  changedPermalinks: { [oldPermalink: string]: string };
  fileContent: string;
  setOfAllDocumentsPath: Set<Lowercase<string>>;
  normalisedUrls: Set<string>;
  currentRepoName: string;
}): Promise<{
  fileContent: string;
  dom: JSDOM;
  changedPermalinks: { [oldPermalink: string]: string };
}> {
  for (const tag of dom.window.document.querySelectorAll(tagName)) {
    // replace permalinks with lowercase and in changedPermalinks
    if (attribute === "href") {
      /**
       * Ideally this code should be const a = tag as HTMLAnchorElement;
       * However, HTMLAnchorElement is a built-in interface in the browser's DOM API,
       * which means that it's only available in a browser environment.
       * In development, hovering over tag will show the inferred type as HTMLAnchorElement
       */
      const a = tag as any;

      let rawPermalink = getRawPermalink(a[attribute]);

      if (changedPermalinks[rawPermalink]) {
        a[attribute] = a.href.replace(
          rawPermalink,
          changedPermalinks[rawPermalink]
        );
        fileContent = fileContent.replace(
          rawPermalink,
          changedPermalinks[rawPermalink]
        );
      }

      const { fileContent: href } = await updateFilesUploadsPath(
        a.href,
        setOfAllDocumentsPath,
        currentRepoName
      );
      if (a.href !== href) {
        fileContent = fileContent.replace(a.href, href);
      }
    } else if (attribute === "src") {
      /**
       * Ideally this code should be const img = tag as HTMLImageElement;
       * However, HTMLImageElement is a built-in interface in the browser's DOM API,
       * which means that it's only available in a browser environment.
       * In development, hovering over tag will show the inferred type as HTMLImageElement
       */
      const img = tag as any;

      let rawPermalink = getRawPermalink(img[attribute]);

      if (changedPermalinks[rawPermalink]) {
        img[attribute] = img.src.replace(
          rawPermalink,
          changedPermalinks[rawPermalink]
        );
      }

      const { fileContent: src } = await updateFilesUploadsPath(
        img.src,
        setOfAllDocumentsPath,
        currentRepoName
      );
      if (img.src !== src) {
        fileContent = fileContent.replace(img.src, src);
      }
    }
  }
  return { fileContent, dom, changedPermalinks };
}
/**
 * Requirements:
 * convert `/some/path` to `some/path`
 * convert `some/path/` to `some/path`
 * above two variants with `permalink: ` prefix
 * above two variants with `url: ` prefix
 * @param permalink original permalink
 * @returns raw permalinks without leading/trailing slash
 */

export function getRawPermalink(permalink: string) {
  let trimmedPermalink = permalink.trim();
  if (trimmedPermalink.startsWith(`permalink: `)) {
    trimmedPermalink = trimmedPermalink.slice(11);
  }
  if (trimmedPermalink.startsWith(`url: `)) {
    trimmedPermalink = trimmedPermalink.slice(5);
  }
  if (trimmedPermalink.startsWith(`/`)) {
    trimmedPermalink = trimmedPermalink.slice(1);
  }
  if (trimmedPermalink.endsWith("/")) {
    trimmedPermalink = trimmedPermalink.slice(0, -1);
  }

  return trimmedPermalink;
}
/**
 * We need to modify trailing slashes from files. We get the list of added extensions from
 * https://github.com/isomerpages/isomercms-backend/blob/develop/src/utils/file-upload-utils.js
 */

export async function updateFilesUploadsPath(
  fileContent: string,
  setOfAllDocumentsPath: Set<Lowercase<string>>,
  currentRepoName: string
): Promise<{ fileContent: string }> {
  /**
   * NOTE: We don't want to change URLs of external links, eg https://www.google.com
   * We also want to capture relative links, eg ../files/abc.pdf
   */
  const fileRegexWithTrailingSlash =
    /^(?!(www\.|https?:\/\/))(\.\.\/)*(\/)*(files|images)\/.*.(pdf|png|jpg|gif|tif|bmp|ico|svg)\//gi;
  const matches = fileContent.match(fileRegexWithTrailingSlash);
  if (matches) {
    for (const match of matches) {
      // sanity checks that should have been already guaranteed by regex
      assert(match.endsWith("/"));
      assert(match.startsWith("/"));

      let newFilePath = match.slice(0, -1);
      fileContent = fileContent.replace(match, newFilePath);
    }
  }

  /**
   * NOTE: We don't want to change URLs of external links, eg https://www.google.com
   * We also want to capture relative links, eg ../files/abc.pdf
   * WE modify them to be small casing, then report it
   */
  const fileRegex =
    /^(?!(www\.|https?:\/\/))(\.\.\/)*(\/)*(files|images)\/.*.(pdf|png|jpg|gif|tif|bmp|ico|svg)/gi;
  const fileMatches = fileContent.match(fileRegex);
  if (fileMatches) {
    for (const match of fileMatches) {
      const lowerCaseMatch = match.toLowerCase();
      fileContent = fileContent.replace(match, lowerCaseMatch);
      let doesFileExist = false;
      for (const path of setOfAllDocumentsPath) {
        if (
          path === lowerCaseMatch ||
          decodeURIComponent(lowerCaseMatch) === path
        ) {
          doesFileExist = true;
          break;
        }
      }
      if (!doesFileExist) {
        // log this in some file for manual checking after the migration
        const errorMessage: errorMessage = {
          message: `File ${fileContent} does not exist in the repo`,
          repoName: currentRepoName,
        };
        await fs.promises.appendFile(
          path.join(__dirname, LOGS_FILE),
          `${errorMessage.repoName}: ${errorMessage.message} ` + os.EOL
        );
      }
    }
  }
  return { fileContent };
}

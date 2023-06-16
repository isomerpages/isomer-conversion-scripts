import { JSDOM } from "jsdom";
import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { errorMessage } from "./errorMessage";
import { REPOS_WITH_ERRORS } from "./constants";

type TagAttribute<T extends "a" | "img"> = T extends "a"
  ? { tagName: "a"; attribute: "href" }
  : { tagName: "img"; attribute: "src" };
export async function modifyTagAttribute({
  dom,
  tagAttribute: { tagName, attribute },
  changedPermalinks,
  hasFileChanged,
  setOfAllDocumentsPath,
  normalisedUrls,
  currentRepoName,
}: {
  dom: JSDOM;
  tagAttribute: TagAttribute<"a" | "img">;
  changedPermalinks: { [oldPermalink: string]: string };
  hasFileChanged: boolean;
  setOfAllDocumentsPath: Set<string>;
  normalisedUrls: Set<string>;
  currentRepoName: string;
}): Promise<{
  hasFileChanged: boolean;
  normalisedUrls: Set<string>;
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
        hasFileChanged = true;
      }

      const { fileContent, hasChanged: fileUploadsPathChanged } =
        await updateFilesUploadsPath(
          a.href,
          setOfAllDocumentsPath,
          currentRepoName
        );
      a.href = fileContent;
      if (a.href !== fileContent) {
        console.log("file upload path changed", a.href, fileContent);
        // NOTE: JSDOM normalises href to add the trailing slash, which breaks our files url
        // so we need to manually remove the trailing slash
        normalisedUrls.add(a.href);
      }
      hasFileChanged = hasFileChanged || fileUploadsPathChanged;
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
        hasFileChanged = true;
      }

      const { fileContent, hasChanged: fileUploadsPathChanged } =
        await updateFilesUploadsPath(
          img.src,
          setOfAllDocumentsPath,
          currentRepoName
        );
      img.src = fileContent;
      if (img.src !== fileContent) {
        console.log("file upload path changed", img.src, fileContent);
        // NOTE: JSDOM normalises href to add the trailing slash, which breaks our files url
        // so we need to manually remove the trailing slash
        normalisedUrls.add(img.src);
      }
      hasFileChanged = hasFileChanged || fileUploadsPathChanged;
    }
  }
  return { hasFileChanged, normalisedUrls, dom, changedPermalinks };
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
    trimmedPermalink = permalink.trim().slice(11);
  }
  if (trimmedPermalink.startsWith(`url: `)) {
    trimmedPermalink = permalink.trim().slice(5);
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
  setOfAllDocumentsPath: Set<string>,
  currentRepoName: string
): Promise<{ fileContent: string; hasChanged: boolean }> {
  console.log({ fileContent });
  const folderRegex = /(files|images)\/.*.(pdf|png|jpg|gif|tif|bmp|ico|svg)\//g;
  const matches = fileContent.match(folderRegex);
  let hasChanged = false;
  if (matches) {
    matches.forEach(async (match) => {
      assert(match.endsWith("/")); // sanity check that should have been guaranteed by regex
      let newFilePath = match.slice(0, -1);
      fileContent = fileContent.replace(match, newFilePath);
      if (!newFilePath.startsWith("/")) {
        // this is needed since setOfAllDocumentsPath has leading slash
        newFilePath = "/" + newFilePath;
      }
      if (!setOfAllDocumentsPath.has(newFilePath)) {
        // log this in some file for manual checking after the migration
        const errorMessage: errorMessage = {
          message: `File ${fileContent} does not exist in the repo`,
          repoName: currentRepoName,
        };
        await fs.promises.appendFile(
          path.join(__dirname, REPOS_WITH_ERRORS),
          `${errorMessage.repoName}: ${errorMessage.message} ` + os.EOL
        );
      }
    });
    hasChanged = true;
  }
  return { fileContent, hasChanged };
}

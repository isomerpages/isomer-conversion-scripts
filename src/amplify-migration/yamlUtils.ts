import YAML, { Scalar, isPair, isScalar, isMap } from "yaml";
import { getRawPermalink } from "./jsDomUtils";
import { REPOS_WITH_ERRORS } from "./constants";
import os from "os";
import fs from "fs";
import path from "path";
import { errorMessage } from "./errorMessage";

export const YML_KEYS = [
  "shareicon",
  "favicon",
  "file_url",
  "image",
  "logo",
  "background",
];

export function isYAMLPair(node: any): node is YAML.Pair<Scalar, Scalar> {
  if (!isPair(node)) return false;
  if (isScalar(node.value) && isScalar(node.key)) return true;
  return false;
}

export async function changeContentInYamlFile(
  item: any,
  changedPermalinks: { [oldPermalink: string]: string },
  setOfAllDocumentsPath: Set<string>,
  fileContent: string,
  currentRepoName: string
) {
  const oriFilePath = item.value.value;
  let filePath = item.value.value;
  const originalPermalink = getRawPermalink(filePath);
  if (changedPermalinks[originalPermalink]) {
    const newPermalink = originalPermalink.toLowerCase();
    filePath = newPermalink;
  }

  if (setOfAllDocumentsPath.has(filePath.toLowerCase())) {
    // YAML does not seem to have a way to update the value of a key in place
    fileContent = fileContent.replace(oriFilePath, filePath.toLowerCase());
  } else {
    // log this in some file for manual checking after the migration
    const errorMessage: errorMessage = {
      message: `File ${filePath} does not exist in the repo`,
      repoName: currentRepoName,
    };
    await fs.promises.appendFile(
      path.join(__dirname, REPOS_WITH_ERRORS),
      `${errorMessage.repoName}: ${errorMessage.message} ` + os.EOL
    );
  }
  return fileContent;
}

export interface changeLinksInYmlProp {
  yamlContents: YAML.YAMLMap.Parsed | YAML.Scalar.Parsed | any;
  fileContent: string;
  changedPermalinks: { [oldPermalink: string]: string };
  setOfAllDocumentsPath: Set<string>;
  currentRepoName: string;
}

export async function changeLinksInYml({
  yamlContents,
  fileContent,
  changedPermalinks,
  setOfAllDocumentsPath,
  currentRepoName,
}: changeLinksInYmlProp): Promise<string> {
  if (isMap(yamlContents) && yamlContents.items) {
    let modifiedFileContent = fileContent;
    for (const item of yamlContents.items) {
      if (isPair(item) && isMap(item.value)) {
        await Promise.all(
          item.value.items.map(async (subItem) => {
            modifiedFileContent = await changeLinksInYml({
              yamlContents: subItem,
              fileContent: modifiedFileContent,
              changedPermalinks,
              setOfAllDocumentsPath,
              currentRepoName,
            });
          })
        );
      }
      if (
        isScalar(item.value) &&
        isScalar(item.key) &&
        YML_KEYS.includes(item.key.toString())
      ) {
        modifiedFileContent = await changeContentInYamlFile(
          item,
          changedPermalinks,
          setOfAllDocumentsPath,
          modifiedFileContent,
          currentRepoName
        );
      }
    }

    return modifiedFileContent;
  }

  if (
    isYAMLPair(yamlContents) &&
    yamlContents.value &&
    yamlContents.key &&
    YML_KEYS.includes(yamlContents.key.toString())
  ) {
    fileContent = await changeContentInYamlFile(
      yamlContents,
      changedPermalinks,
      setOfAllDocumentsPath,
      fileContent,
      currentRepoName
    );
    return fileContent;
  }
  return fileContent;
}

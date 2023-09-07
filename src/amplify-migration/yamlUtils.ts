import YAML, { Scalar, isPair, isScalar, isMap, isSeq, Pair } from "yaml";
import { getRawPermalink } from "./jsDomUtils";
import { LOGS_FILE } from "./constants";
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
/**
 * As the Concrete Syntax Tree is generated, this utility function checks if the node is a
 * YAML pair with scalar key and scalar value. Else, the nodes in the vector would have to
 * parsed recursively.
 * @param node The node to check
 * @returns If the node is a YAML pair with scalar key and scalar value
 */
export function isYAMLPairScalar(node: any): node is YAML.Pair<Scalar, Scalar> {
  if (!isPair(node)) return false;
  if (isScalar(node.value) && isScalar(node.key)) return true;
  return false;
}

export async function changeContentInYamlFile(
  item: Pair<Scalar, Scalar>,
  changedPermalinks: { [oldPermalink: string]: string },
  setOfAllDocumentsPath: Set<string>,
  fileContent: string,
  currentRepoName: string
) {
  if (!item.value || !item.value.toString()) return fileContent;
  const oriFilePath = item.value.toString();
  let filePath = item.value.toString();
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
      path.join(__dirname, LOGS_FILE),
      `${errorMessage.repoName}: ${errorMessage.message} ` + os.EOL
    );
  }
  return fileContent;
}

export interface changeLinksInYmlProp {
  yamlNode: YAML.YAMLMap.Parsed | YAML.Scalar.Parsed | any;
  fileContent: string;
  changedPermalinks: { [oldPermalink: string]: string };
  setOfAllDocumentsPath: Set<string>;
  currentRepoName: string;
}

/**
 * This function recursively traverses the YAML tree and changes the links in the YAML file.
 */
export async function changeLinksInYml({
  yamlNode: yamlNode,
  fileContent,
  changedPermalinks,
  setOfAllDocumentsPath,
  currentRepoName,
}: changeLinksInYmlProp): Promise<string> {
  /**
   * Checks if the node is a map
   * eg.
   * sections:
   *   - hero:
   *       title: "title"
   *       ...
   *   - infopic:
   *       title: "title"
   *       ...
   */
  if (isMap(yamlNode) && yamlNode.items) {
    // Iterate through all the children of the parent node
    for (const item of yamlNode.items) {
      fileContent = await changeLinksInYml({
        yamlNode: item,
        fileContent: fileContent,
        changedPermalinks,
        setOfAllDocumentsPath,
        currentRepoName,
      });
    }

    return fileContent;
  }

  /**
   * Checks if the node child is a sequence/map
   * eg.
   * - hero:
   *    title: "title"
   *    ...
   *
   */
  if (isPair(yamlNode) && (isSeq(yamlNode.value) || isMap(yamlNode.value))) {
    // Iterate through all the children of the parent node
    for (const item of yamlNode.value.items) {
      fileContent = await changeLinksInYml({
        yamlNode: item,
        fileContent: fileContent,
        changedPermalinks,
        setOfAllDocumentsPath,
        currentRepoName,
      });
    }
    return fileContent;
  }

  /**
   * This is for the case where the YAML file has a single key-value pair.
   * We do not need to traverse the tree any more in this case as we have
   * already reached the leaf node.
   */
  if (
    isYAMLPairScalar(yamlNode) &&
    yamlNode.value &&
    yamlNode.key &&
    YML_KEYS.includes(yamlNode.key.toString())
  ) {
    fileContent = await changeContentInYamlFile(
      yamlNode,
      changedPermalinks,
      setOfAllDocumentsPath,
      fileContent,
      currentRepoName
    );
    return fileContent;
  }
  return fileContent;
}

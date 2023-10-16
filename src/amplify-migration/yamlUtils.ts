import YAML, { Scalar, isPair, isScalar, isMap, isSeq, Pair } from "yaml";
import { getRawPermalink, updateFilesUploadsPath } from "./jsDomUtils";
import { LOGS_FILE, fileExtensionsRegex } from "./constants";
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
  "faq",
  "url",
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
  setOfAllDocumentsPath: Set<Lowercase<string>>,
  fileContent: string,
  currentRepoName: string
) {
  if (!item.value || !item.value.toString()) return fileContent;
  const oriFilePath = item.value.toString();
  let filePath = item.value.toString();

  const originalPermalink = getRawPermalink(filePath);
  if (changedPermalinks[originalPermalink]) {
    const newPermalink = originalPermalink.toLocaleLowerCase();
    filePath = newPermalink;
  }

  const isFileAsset = fileExtensionsRegex
    .split("|")
    .map((ext) => `.${ext}`)
    .find((ext) => filePath.includes(ext));
  if (!isFileAsset) {
    // This could just be a link to the page
    return fileContent;
  }
  // YAML does not seem to have a way to update the value of a key in place
  // We just mutate all to lowercase to not care about encoding. Then we report if image is not found
  // rather than programmatically fixing something that we are not 100% sure of.
  const { fileContent: modifiedFilePath } = await updateFilesUploadsPath(
    filePath,
    setOfAllDocumentsPath,
    currentRepoName
  );
  if (filePath !== modifiedFilePath) {
    fileContent = fileContent.replace(`: ${filePath}`, `: ${modifiedFilePath}`);
  }

  if (!setOfAllDocumentsPath.has(filePath.toLowerCase() as Lowercase<string>)) {
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
  setOfAllDocumentsPath: Set<Lowercase<string>>;
  currentRepoName: string;
}

export type parseYmlProp = Omit<changeLinksInYmlProp, "yamlNode"> & {
  filePath: string;
};

export async function parseYml({
  filePath,
  fileContent,
  changedPermalinks,
  setOfAllDocumentsPath,
  currentRepoName,
}: parseYmlProp): Promise<string> {
  /**
   * There was an edge case where the html was too complex for yamlParser to parse
   * and maximum call stack size was reached, therefore, we will only parse the
   * yaml portion of the file
   */
  let yamlFileContent: string;

  const noYamlInFile =
    !filePath.endsWith(".yml") && !fileContent.includes("---\n");
  if (noYamlInFile) {
    return fileContent;
  }

  if (filePath.endsWith(".yml")) {
    yamlFileContent = fileContent;
  } else {
    yamlFileContent = fileContent.split("---\n")[1];
  }

  const yamlParser = YAML.parseAllDocuments(yamlFileContent);

  /**
   * This is to handle the case where the yml file has multiple documents which are
   * separated by document end marker lines, ie when the yaml content exists as the
   * front matter in a .md file. Since we don't expect to have > 1 yml
   * document in a single file, we will only process the first document. The other
   * documents in this array are expected to be null.
   */
  const yamlDocument = yamlParser[0];

  /**
   * This is a safe cast as we expect the files to be of valid yaml syntax and not `null`.
   * This represents a YAML mapping, which is a collection of key-value pairs. A mapping
   * is represented by a colon (:) separating the key and value, and can contain any
   * valid YAML node as a value.
   */
  const yamlContents = yamlDocument?.contents as YAML.YAMLMap.Parsed;

  const modifiedContent = await changeLinksInYml({
    yamlNode: yamlContents,
    fileContent: yamlFileContent,
    changedPermalinks,
    currentRepoName,
    setOfAllDocumentsPath,
  });
  if (filePath.endsWith(".yml")) {
    return modifiedContent;
  }
  const splitFileContent = fileContent.split("---\n");
  splitFileContent[1] = modifiedContent; //modify the yaml content
  return splitFileContent.join("---\n");
}

/**
 * This function recursively traverses the YAML tree and changes the links in the YAML file.
 */
export async function changeLinksInYml({
  yamlNode,
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

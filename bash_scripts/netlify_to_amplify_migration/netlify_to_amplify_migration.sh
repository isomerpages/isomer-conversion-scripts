#!/bin/bash

## Error-handling ##
# https://gist.github.com/mohitmun/ecaada4ac51b386cd0e3d52dc2193e4f
set -Eeo pipefail

# Get repo name from user
read -p "Enter repo name: " repo_name
read -p "Enter name" name

build_spec=$(<amplify.yml)


# Create amplify app, get appId 
appId=$(aws amplify create-app --name "$repo_name" --access-token $PERSONAL_ACCESS_TOKEN --repository https://github.com/isomerpages/"$repo_name" --build-spec "$build_spec" | jq '.app.appId' -r)

aws amplify create-branch --app-id ${appId} --branch-name master --enable-auto-build
aws amplify create-branch --app-id ${appId} --branch-name staging --enable-auto-build
aws amplify start-job --app-id ${appId} --branch-name master --job-type RELEASE
aws amplify start-job --app-id ${appId} --branch-name staging --job-type RELEASE

current_pwd=$(pwd)
# Run add-trailing-slash.sh
../trailing_slash/add-trailing-slash.sh "$repo_name"

cd ~/isomer-migrations/$repo_name

# Read the file into a variable
yaml_file=$(cat _config.yml)

# Replace the URLs using regex pattern substitution
yaml_file=$(echo "$yaml_file" | sed "s/\(staging: https:\/\/\)[^ ]*/\1staging.${appId}.amplifyapp.com\//g")
yaml_file=$(echo "$yaml_file" | sed "s/\(prod: https:\/\/\)[^ ]*/\1master.${appId}.amplifyapp.com\//g")

# Write the modified yaml file back to disk
echo "$yaml_file" > _config.yml


git add _config.yml
git commit -m "chore: update config.yml file"
echo "Pushing to remote"
git push -u origin add-trailing-slash
#Create pull request
hub pull-request -b staging -h add-trailing-slash -m "migrate: adding trailing slash to permalinks" -f --no-edit --squash


git push origin --delete add-trailing-slash

echo "Merge and delete of add-trailing-slash branch successful"

cd "$current_pwd"
# generate scipt to update prod db with new values
user_id=1 #todo figure out how to change this hardcoded value to the actual user id

echo >> sqlcommands.txt
echo "INSERT INTO sites (name, api_token_name, site_status, job_status, creator_id) VALUES ('$name', 'EMPTY', 'INITIALIZED', 'READY', '$user_id');" >> sqlcommands.txt
echo "INSERT INTO repos (name, url, created_at, updated_at, site_id) SELECT '$repo_name', 'https://github.com/isomerpages/$repo_name', NOW(),NOW(), id FROM sites WHERE name = '$name';" >> sqlcommands.txt
echo "INSERT INTO deployments (production_url, staging_url, hosting_id, created_at, updated_at, site_id) SELECT 'https://master.${appId}.amplifyapp.com','https://staging.${appId}.amplifyapp.com', '${appId}', NOW(), NOW(),id FROM sites WHERE name = '$name';" >> sqlcommands.txt






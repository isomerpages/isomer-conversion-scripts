#!/bin/bash 

## Error-handling ##
# https://gist.github.com/mohitmun/ecaada4ac51b386cd0e3d52dc2193e4f
set -Eeo pipefail
trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG
trap 'echo "\"${last_command}\" command filed with exit code $?."' EXIT
####################

# removes Gemfile, Gemfile.lock, netlify.toml, .ruby-version
rm -f Gemfile.lock
rm -f Gemfile
rm -f netlify.toml
rm -f .ruby-version

# adds jekyll gem and gems for key Isomer plugins"
{
    echo 'source "https://rubygems.org"'
    echo ''
    echo 'gem "isomer-jekyll", group: :jekyll_plugins'
} >> Gemfile

# create empty netlify.toml
echo -n "" > netlify.toml

# adds to .jekyll-cache to .gitignore file as Jekyll 4.0 creates template cache folder .jekyll-cache
{
    echo -e '\n.jekyll-cache'
} >> .gitignore
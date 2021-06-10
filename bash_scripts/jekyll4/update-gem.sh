#!/bin/bash 

## Error-handling ##
# https://gist.github.com/mohitmun/ecaada4ac51b386cd0e3d52dc2193e4f
set -Eeo pipefail
trap 'last_command=$current_command; current_command=$BASH_COMMAND' DEBUG
trap 'echo "\"${last_command}\" command filed with exit code $?."' EXIT
####################

remove_config_old_plugins_blurb () {
  # brute force approach for removing old plugins blurb
  # find line numbers where 'plugins:' appear
  # starting on the following line after "plugins:"
  #   check whether line has space indent
  #     if indent, line is an attribute of plugins; continue checking
  #     else, line is a new key; note down the current line number
  file=$1

  line_nums=$(grep -n 'plugins:' $file | cut -d : -f 1)
  LAST_LINE_NUM=$(( $(wc -l < $file | bc)+1 ))
  var=""

  for line_num in $line_nums
  do
    var="${var}${line_num}"
    COUNT=${line_num}
    while IFS= read -r line || [ -n "$line" ]; do
      if [[ $line != $' '* ]]; then
        var="${var},${COUNT} d;"
        break
      fi
      COUNT=$(( $COUNT + 1 ))
    done < <(tail -n "+$(( $line_num + 1 ))" $file)
    
    # if last line of file is an attribute on "plugins:",
    # we specify line number manually
    if [[ $var != *';' ]]; then
      var="${var},${LAST_LINE_NUM} d;"
    fi
  done
  sed -i "" "${var}" $file
}

add_config_new_plugins_blurb() {
  # adds Isomer Jekyll gem plugins
  file=$1
  {
    echo 'plugins:'
    echo '  - jekyll-feed'
    echo '  - jekyll-assets'
    echo '  - jekyll-paginate'
    echo '  - jekyll-sitemap'
    echo '  - jekyll-remote-theme'
  } >> $file
}

update_repo_files() {
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
  {
    echo -n ''
  } >> netlify.toml

  # adds to .jekyll-cache to .gitignore file as Jekyll 4.0 creates template cache folder .jekyll-cache
  {
    echo -e '\n.jekyll-cache'
  } >> .gitignore
}

update_config_plugins() {
  # updates _config.yml plugins to be compatible with Isomer Jekyll 
  # deletes and recreates plugins yml list to standardize list across all sites
  file='_config.yml'
  remove_config_old_plugins_blurb $file
  add_config_new_plugins_blurb $file
}

update_repo_files
update_config_plugins
# removes Gemfile.lock
rm Gemfile.lock

# removes github-pages gem
sed -i "" "s/gem 'github-pages', group: :jekyll_plugins//" Gemfile

# adds jekyll gem and gems for key Isomer plugins"
{
    echo 'gem "jekyll", "~> 4.2"'
    echo ''
    echo 'group :jekyll_plugins do'
    echo '    gem "jekyll-feed", "0.15.1"'
    echo '    gem "jekyll-sitemap", "1.4.0"'
    echo '    gem "jekyll-assets", "1.0.0"'  
    echo '    gem "jekyll-paginate", "1.1.0"'
    echo '    gem "jekyll-remote-theme", "0.4.2"'
    echo '  end'
} >> Gemfile

# create new Gemfile lock
bundle install

# adds to .jekyll-cache to .gitignore file as Jekyll 4.0 creates template cache folder .jekyll-cache
{
    echo -e '\n.jekyll-cache'
} >> .gitignore
Updating the npm package
========================

1. Update version in dev::

    git checkout dev
    git pull
    npm version patch  // or minor, or major; prints new version number

2. Merge into master::

    git checkout master
    git merge dev
    grunt
    
3. Push to remotes and npm::

    git push origin dev
    git push origin master
    git push origin v0.0.1  // use version printed by "npm version" command above
    npm publish

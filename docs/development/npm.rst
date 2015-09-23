Updating the npm package
========================

1. Update version in ``docs/conf.py``::

    // Edit `version = ...` and `release = ...` in conf.py
    git add conf.py
    git commit -m "Update version in conf.py"

2. Update version in dev::

    git checkout dev
    npm version patch  // or minor, or major (needs to match version above)

2. Merge into master::

    git checkout master
    git merge dev
    grunt
    
3. Push to remotes and npm::

    git push origin dev
    git push origin master
    git push origin v0.0.1  // again, use version printed by "npm version" command above
    npm publish

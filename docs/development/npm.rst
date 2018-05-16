Updating the npm package
========================

.. highlight:: bash

1. Get latest dev version::

    git checkout dev
    git pull

2. Merge into master and test::

    git checkout master
    git pull
    git merge dev
    grunt     

3. Update version number on master::

    npm version patch  # or minor, or major; prints new version number

4. Merge updated version number into dev::

    git checkout dev
    git merge master

4. Push to remotes and npm::

    git push origin dev
    git push origin master
    git push origin v0.0.1  # use version printed by "npm version" command above
    npm --version # ensure >= 4.0.0 (required to run build scripts)
    npm publish --unsafe-perm # flag prevents scripts failing when npm is run as root

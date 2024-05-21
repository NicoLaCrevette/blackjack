echo "web: node server.js" > Procfile

git add Procfile
git commit -m "Add Procfile for Heroku"
git push origin master

heroku login

heroku create

git push heroku master

heroku open
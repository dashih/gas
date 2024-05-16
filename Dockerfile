FROM node:20.13.1
WORKDIR /home/node/app
COPY . .
EXPOSE 80
CMD [ "node", "app.js" ]
HEALTHCHECK CMD curl --fail http://localhost/api/getVersion

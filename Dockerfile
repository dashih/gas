FROM node:18.12.0
WORKDIR /home/node/app
COPY . .
EXPOSE 80
CMD [ "node", "app.js" ]
HEALTHCHECK CMD curl --fail http://localhost/api/getVersion

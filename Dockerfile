FROM node:20

WORKDIR /server-dir

COPY . .

ENV DATABASE_URL="file:/storage/dev.db"
ENV PORT=3000

EXPOSE 3000

# Install deps

RUN ["npm", "install"]

# Mount a volume

VOLUME "/storage"

# Run build (`prisma generate` followed by `tsc`)

RUN ["npm", "run", "build"]

RUN set -e && \
    mkdir build/uploads && \
    mkdir build/prisma/data/images && \
    cp prisma/data/images/ build/prisma/data/images/;

ENTRYPOINT ["npm", "run"]

CMD ["start"]
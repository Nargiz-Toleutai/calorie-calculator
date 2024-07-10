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
VOLUME "/server-dir/uploads"

# Run build (`prisma generate` followed by `tsc`)

RUN ["npm", "run", "build"]

RUN set -e && \
    mkdir build/uploads || true;

RUN set -e && \
    ln -s /server-dir/uploads /server-dir/build/uploads;

RUN set -e && \
    mkdir build/prisma/data/images && \
    cp -r prisma/data/images/ build/prisma/data/;

ENTRYPOINT ["npm", "run"]

CMD ["start"]
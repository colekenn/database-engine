FROM gcc:13-bookworm AS build

RUN apt-get update && apt-get install -y cmake && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

RUN cmake -B build -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build --target minidb_server -j"$(nproc)"

FROM gcc:13-bookworm

COPY --from=build /app/build/minidb_server /usr/local/bin/minidb_server
WORKDIR /app

EXPOSE 8080
CMD ["/bin/sh", "-c", "minidb_server demo.db ${PORT:-8080}"]

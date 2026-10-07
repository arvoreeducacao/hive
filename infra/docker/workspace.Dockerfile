FROM public.ecr.aws/docker/library/node:22.23.2-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update -qq \
 && apt-get install -y -qq \
      tmux git curl ripgrep procps locales coreutils \
      openssh-server mosh netcat-openbsd \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update -qq \
 && apt-get install -y -qq gh \
 && rm -rf /var/lib/apt/lists/*

ARG CLAUDE_CODE_VERSION=2.1.258
RUN npm install -g --no-audit --no-fund "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force

RUN sed -i \
      -e "s|^#\?AuthorizedKeysFile.*|AuthorizedKeysFile /workspace/home/.ssh/authorized_keys|" \
      -e "s|^#\?PasswordAuthentication.*|PasswordAuthentication no|" \
      -e "s|^#\?PermitRootLogin.*|PermitRootLogin prohibit-password|" \
      /etc/ssh/sshd_config \
 && mkdir -p /run/sshd

RUN sed -i "s|^# *en_US.UTF-8 UTF-8|en_US.UTF-8 UTF-8|" /etc/locale.gen \
 && locale-gen en_US.UTF-8

ENV LANG=en_US.UTF-8

WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY server ./server

ENV HIVE_SERVER_DIR=/app/server
ENV PORT=8791
ENV HOME=/workspace/home
EXPOSE 8791

COPY infra/docker/workspace-boot.sh /usr/local/bin/workspace-boot
RUN chmod 0755 /usr/local/bin/workspace-boot

HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8791)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/usr/local/bin/workspace-boot"]

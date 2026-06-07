# 运维文档索引

本目录用于沉淀 `privydrop.app` 线上部署、入口层切换、故障排查的时间线文档，方便后续接手人快速判断“当时线上真实拓扑是什么”。

## 文档列表

- [2026-04-24-privydrop-ubuntu-入口排障记录.md](/home/bj/baijun/indie_hacker/privydrop/build/运维/2026-04-24-privydrop-ubuntu-入口排障记录.md)
  适用时期：`2026-04-24` 到 `2026-06-07`
  内容：旧线上入口仍是宿主机 `snap caddy` 时的两次故障排查记录。

- [2026-06-08-refactor-webrtc-lifecycle-docker部署记录.md](/home/bj/baijun/indie_hacker/privydrop/build/运维/2026-06-08-refactor-webrtc-lifecycle-docker部署记录.md)
  适用时期：`2026-06-08` 起
  内容：将 `43.153.3.146` 切到 Docker `nginx + coturn + app` 统一入口的部署记录，以及这次部署中踩到的端口冲突、权限问题和验证结果。

## 快速判断应该看哪篇

- 如果你看到线上 `80/443` 是 `snap.caddy.server.service` 在监听，看 `2026-04-24-...`
- 如果你看到线上 `80/443` 是 `privydrop-nginx` 在监听，看 `2026-06-08-...`

## 维护约定

- 每次生产拓扑发生变化，新增一篇时间线文档，不要覆盖历史文档。
- 如果旧文档的前提已经失效，在旧文档顶部补“历史说明”并指向新文档。
- 敏感信息不要明文落盘；保留主机、路径、服务结构、命令和验证结论即可。

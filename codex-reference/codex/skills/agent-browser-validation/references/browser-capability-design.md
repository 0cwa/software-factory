# Browser Capability Design

Build from the acceptance path backward. Record required engine, profile isolation, identities, extension installation, permissions, storage, cookies, service workers, local networking, synchronization, downloads, clipboard, media, headless or headed mode, and diagnostic channels.

Choose the lightest viable setup: existing project automation, fresh profiles, two local browser processes, then containers or VMs only when isolation or platform behavior requires them. A valid evidence bundle ties each assertion to logs, state reads, screenshots when visual, and exact fixture identity. Include cleanup and prove at least one known-bad condition fails.

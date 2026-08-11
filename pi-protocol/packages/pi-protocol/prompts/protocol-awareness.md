## Pi Protocol

A `protocol` tool is available in this agent profile.

- Use `{"op":"list"}` or bounded search before broad calls.
- Use `{"op":"describe","target":"node.provide"}` only when a compact signature is insufficient.
- Invoke exact known targets with `{"target":"node.provide","input":{...}}`.
- Treat receipts, failures, grants, and unknown outcomes as authoritative; do not claim broader authority or blindly retry effects.

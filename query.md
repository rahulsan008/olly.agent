# Browser Agent Tool Query Guide

This extension is query-first: pass `query` whenever possible, and use `selector` as fallback.

All tools return:

```json
{
  "success": true,
  "data": {}
}
```

or

```json
{
  "success": false,
  "error": "reason"
}
```

## 1. Action Tools

`click`

```json
{ "query": "Post button" }
```

`type`

```json
{ "query": "comment box", "text": "Nice post!" }
```

`hover`

```json
{ "query": "Profile menu" }
```

`scroll`

```json
{ "direction": "down", "amount": 400 }
```

Element scroll:

```json
{ "query": "comments section", "direction": "down", "amount": 250 }
```

`press_key`

```json
{ "key": "Enter" }
```

## 2. Find Tools

`find`

```json
{ "query": "search box" }
```

`find_by_text`

```json
{ "query": "Login" }
```

`find_button`

```json
{ "query": "Submit" }
```

`find_input`

```json
{ "query": "Email" }
```

## 3. Get Tools

`get_page_text`

```json
{}
```

`get_buttons`

```json
{}
```

`get_inputs`

```json
{}
```

`get_links`

```json
{}
```

`get_visible_elements`

```json
{}
```

## 4. Wait Tools

`wait_for_element`

```json
{ "query": "comment box", "timeoutMs": 5000 }
```

`wait_for_text`

```json
{ "text": "Welcome", "timeoutMs": 5000 }
```

## 5. Navigation Tools

`go_to_url`

```json
{ "url": "https://example.com" }
```

`go_back`

```json
{}
```

`refresh`

```json
{}
```

## 6. Clipboard Tools

`copy`

```json
{ "text": "hello world" }
```

`paste`

```json
{}
```

`get_selected`

```json
{}
```

## 7. Selector Tool

`generate_selector`

```json
{ "query": "Post button" }
```

## 8. Record Tools (rrweb)

`record_start`

```json
{}
```

`record_stop`

```json
{}
```

`record_replay`

```json
{}
```

## Notes for Devs

- In the side panel Tool Tester tab, pick a tool and pass args JSON.
- If both are provided, typed Query input overrides `args.query`.
- `scroll` now returns movement info in `data`:

```json
{
  "before": { "top": 0, "left": 0 },
  "after": { "top": 400, "left": 0 },
  "moved": true
}
```

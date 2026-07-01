# 翻译方法论（Translation Methodology）

本文档记录了英国入籍测试题库（Life in the UK Test）中文翻译任务的完整方法与流程。

---

## 1. 任务类型

项目中共有以下翻译任务，对应 `data/AI_TASKS.md` 中定义的任务代码：

| 任务代码 | 范围 | 输出字段 |
|---------|------|---------|
| **G2** | 考题翻译 | `question_zh`, `options[].zh`, `explanation_zh` |
| **G3** | 知识内容翻译 | `zh`（content unit 级别）|
| **G4** | 考点映射 | `linked_content`（考题关联到知识点 ID）|

---

## 2. 术语规范

### 2.1 词汇表（Glossary）

翻译前必须读取 `data/glossary.md`，并**严格按照词汇表中的对应关系**翻译专有名词。词汇表优先级高于通用翻译习惯。

示例：
- Parliament → 议会（非"国会"）
- House of Commons → 下议院
- Magna Carta → 大宪章

### 2.2 人名与地名规则

- **首次出现**时，格式为：`中文名（English Name）`，例如：`威廉一世（William I）`、`圣帕特里克（St Patrick）`
- **后续出现**可直接使用中文名
- 无通用中文译名的人名（如现代政治人物），保留英文原名

### 2.3 引号规范

中文文本中不使用英文直引号（`"`），改用中文引号：
- 强调词或专有术语：使用 `"..."` 或 `《...》`（如"光荣革命"、"福利国家"）
- **JSON 文件中**：必须使用中文引号 `"..."` 而非英文 `"`，以避免 JSON 解析错误

---

## 3. 考题翻译（G2）

### 3.1 字段映射

每道考题（JSON 对象）需填充以下中文字段：

```json
{
  "question_zh": "问题的中文翻译",
  "options": [
    { "zh": "选项A的中文翻译" },
    { "zh": "选项B的中文翻译" }
  ],
  "explanation_zh": "解释的中文翻译"
}
```

### 3.2 翻译原则

1. **忠实原文**：不添加、删减原文信息
2. **选项数量不变**：翻译版选项数必须与原版完全一致
3. **保留数字与年份**：年份、数字保持原样（如 `1066`、`18世纪`）
4. **专有名词首次出现**：按 §2.2 格式处理
5. **解释语气**：`explanation_zh` 语气简洁、陈述式，对应原文 `explanation_en`

### 3.3 特殊题型处理

| 题型 | 处理方式 |
|------|---------|
| 单选题 | 正常翻译全部选项 |
| 多选题（choose two answers）| 在问题末尾加注"（选两项）"，选项数不变 |
| 判断题（True/False） | 选项翻译为"正确"/"错误" |
| 是非题（Yes/No） | 选项翻译为"是"/"否" |

---

## 4. 考点映射（G4）

### 4.1 目标

为每道考题找到 `data/content.json` 中最能支撑答案的知识单元 ID，填入 `linked_content` 字段（数组格式）。

### 4.2 选择逻辑

1. 查看原始 JSON 中的 `candidates` 数组——这些是由向量检索预计算的候选内容单元
2. 选取 `score` 最高且内容**最直接包含答案**的候选项
3. 通常选 **1个** ID 即可；若答案横跨多个内容单元，可选 2~3个
4. 所选 ID 必须存在于 `data/content.json` 中（验证脚本会检查此项）

### 4.3 候选项评分参考

```
candidates[].score 越高 → 语义相关性越强
但仍需人工判断：最高分项不一定直接包含答案
```

推荐策略：
- 优先选 score 最高项
- 若最高分项只提到考点但未给出答案，改选次高分但内容更精准的项

### 4.4 升级处理（ESCALATE）

若所有候选项都与答案无关，且无法在 `content.json` 中找到对应单元：

```json
"linked_content": ["ESCALATE"]
```

---

## 5. 批量翻译工作流

### 5.1 分块策略

考题库（384道）被预先分成 20 个块（chunk_0 到 chunk_19），每块约 20 道题：

```
scratch/exam_chunk_{i}.json              # 原始英文题（含 candidates）
scratch/exam_translated_chunk_{i}.json  # 翻译输出
```

### 5.2 单块翻译步骤

```
1. 读取 scratch/exam_chunk_{i}.json
2. 读取 data/glossary.md（确保术语一致）
3. 对块内每道题执行 G2 + G4
4. 将结果写入 scratch/exam_translated_chunk_{i}.json
```

### 5.3 输出 JSON 格式

每个翻译块文件是一个 JSON 数组：

```json
[
  {
    "id": "q-british-citizenship-test-X-XX",
    "question_zh": "...",
    "options": [
      { "zh": "..." },
      { "zh": "..." }
    ],
    "explanation_zh": "...",
    "linked_content": ["ch3-s06-p010"]
  }
]
```

> **注意**：输出文件中不需要保留英文字段（`question_en`、`options[].en` 等），合并脚本会从原始文件中读取这些字段并合并。

### 5.4 合并与验证

所有块翻译完成后，执行：

```bash
# 合并所有翻译块到主文件
python3 scratch/merge_exam_chunks.py

# 验证 schema 完整性
python3 scripts/validate.py
```

合并脚本的验证项：
- 所有 20 个块文件都存在
- 每道题的选项数与原文匹配
- `linked_content` 中的所有 ID 存在于 `content.json`

---

## 6. 常见错误与修复

### 6.1 JSON 解析错误（unescaped quotes）

**原因**：中文文本中使用了英文双引号 `"..."`，与 JSON 字符串边界冲突。

**症状**：`json.decoder.JSONDecodeError: Expecting ',' delimiter`

**修复**：将中文语境中的英文引号替换为中文引号 `"..."`。可用以下脚本批量修复：

```python
def fix_json_quotes(filename):
    content = open(filename, 'r', encoding='utf-8').read()
    result = []
    i = 0
    in_string = False
    escape_next = False
    while i < len(content):
        c = content[i]
        if escape_next:
            result.append(c); escape_next = False; i += 1; continue
        if c == '\\':
            result.append(c); escape_next = True; i += 1; continue
        if c == '"':
            if not in_string:
                in_string = True; result.append(c); i += 1; continue
            else:
                # Check if this is a valid closing quote
                j = i + 1
                while j < len(content) and content[j] in ' \t\n\r':
                    j += 1
                if j >= len(content) or content[j] in ':,]}':
                    in_string = False; result.append(c); i += 1; continue
                else:
                    # Embedded quote: replace with Chinese quote mark
                    recent = ''.join(result[-50:])
                    opens = recent.count('\u201c')
                    closes = recent.count('\u201d')
                    result.append('\u201c' if opens == closes else '\u201d')
                    i += 1; continue
        result.append(c); i += 1
    open(filename, 'w', encoding='utf-8').write(''.join(result))
```

### 6.2 选项数量不匹配

**原因**：翻译时误将判断题（2选项）当作单选题（4选项）处理。

**诊断**：
```bash
python3 -c "
import json
src = json.load(open('scratch/exam_chunk_N.json'))
tr = json.load(open('scratch/exam_translated_chunk_N.json'))
src_map = {q['id']: q for q in src}
for q in tr:
    s = src_map[q['id']]
    if len(q['options']) != len(s['options']):
        print(q['id'], 'expected', len(s['options']), 'got', len(q['options']))
"
```

**修复**：直接修改翻译块中该题的 `options` 列表，使其与原题数量一致。

### 6.3 无效的 linked_content ID

**原因**：猜测的 content ID 不存在于 `data/content.json`。

**查找有效 ID**：

```bash
python3 -c "
import json
content = json.load(open('data/content.json'))
for item in content:
    if '关键词' in item.get('en', ''):
        print(item['id'], item['en'][:80])
"
```

### 6.4 翻译块内容缺失（ID 遗漏）

**原因**：批量处理中断导致部分题目未翻译。

**诊断**：

```bash
python3 -c "
import json
src_ids = [q['id'] for q in json.load(open('scratch/exam_chunk_N.json'))]
tr_ids = [q['id'] for q in json.load(open('scratch/exam_translated_chunk_N.json'))]
missing = set(src_ids) - set(tr_ids)
print('Missing:', missing)
"
```

**修复步骤**：
1. 找出缺失 ID
2. 从原始块读取对应题目
3. 手动翻译并按 ID 顺序插入翻译块文件

---

## 7. 速率限制策略

使用 Gemini API 翻译时：

- **禁止并发**：并行调用会触发 `RESOURCE_EXHAUSTED (429)` 错误
- **块间等待**：每完成一个块后等待 **12秒** 再处理下一个块
- **推荐策略**：逐块手动触发，不使用自动批处理循环

```bash
python3 -c "import time; time.sleep(12)"
```

---

## 8. 文件路径总览

```
uktest/
├── data/
│   ├── glossary.md                          # 术语词汇表（翻译必读）
│   ├── content.json                         # 知识内容单元（linked_content 来源）
│   └── AI_TASKS.md                          # 任务说明
├── scratch/
│   ├── job_questions_exam.json              # 主考题文件（最终合并目标）
│   ├── exam_chunk_{0-19}.json              # 原始分块（英文，含 candidates）
│   ├── exam_translated_chunk_{0-19}.json   # 翻译输出块
│   └── merge_exam_chunks.py                # 合并脚本
├── scripts/
│   └── validate.py                          # 验证脚本
└── docs/
    └── translation_methodology.md           # 本文档
```

---

*最后更新：2026-07-02*

import { redraw } from 'mithril';
import type { ProofCheck, ProofDocument, ProofStep, ProofVersion, StepType } from './types';

const STORAGE_KEY = 'sologsb-1014-proof-workspace-v1';
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clone = <T>(value: T): T => structuredClone(value);

export const RULES = ['前提', '定义展开', '代入', '等式变形', '分配律', '同类项合并', '数学归纳', '反证法', '构造法', '结论'];

function sampleSteps(): ProofStep[] {
  return [
    { id: 's1', type: 'premise', statement: '$a,b$ 是实数', rule: '前提', references: [], note: '采用实数域中的交换律与分配律。', counterexample: '', alternative: '' },
    { id: 's2', type: 'derivation', statement: '$(a+b)^2=(a+b)(a+b)$', rule: '定义展开', references: ['s1'], note: '把平方写成两个相同因式之积。', counterexample: '', alternative: '' },
    { id: 's3', type: 'derivation', statement: '$(a+b)(a+b)=a^2+ab+ba+b^2$', rule: '分配律', references: ['s2'], note: '', counterexample: '', alternative: '也可先展开后半部分。' },
    { id: 's4', type: 'derivation', statement: '$a^2+ab+ba+b^2=a^2+2ab+b^2$', rule: '同类项合并', references: ['s3'], note: '由实数的交换律，$ab=ba$。', counterexample: '', alternative: '' },
    { id: 's5', type: 'goal', statement: '$(a+b)^2=a^2+2ab+b^2$', rule: '结论', references: ['s4'], note: '目标已由步骤 1 至 4 逐项推出。', counterexample: '', alternative: '' },
  ];
}

function issueSteps(): ProofStep[] {
  return [
    { id: 'i1', type: 'premise', statement: '$n$ 是正整数', rule: '前提', references: [], note: '', counterexample: '', alternative: '' },
    { id: 'i2', type: 'derivation', statement: '$P(1)$ 成立', rule: '前提', references: ['i1'], note: '归纳基例。', counterexample: '', alternative: '' },
    { id: 'i3', type: 'derivation', statement: '若 $P(k)$ 成立，则 $P(k+1)$ 也成立', rule: '数学归纳', references: ['missing-step'], note: '这里故意保留一个失效引用，用于演示检查。', counterexample: '', alternative: '' },
    { id: 'i4', type: 'goal', statement: '$P(n)$ 对所有正整数 $n$ 成立', rule: '结论', references: ['i3'], note: '尚未补齐归纳假设。', counterexample: '', alternative: '' },
  ];
}

function initialDocuments(): ProofDocument[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'doc-algebra',
      title: '完全平方公式证明',
      author: '数学组',
      goal: '$(a+b)^2=a^2+2ab+b^2$',
      symbols: { a: '实数', b: '实数', P: '关于正整数的命题', n: '正整数', k: '正整数' },
      steps: sampleSteps(),
      versions: [],
      updatedAt: now,
    },
    {
      id: 'doc-induction',
      title: '数学归纳法待核对稿',
      author: '学生工作区',
      goal: '$P(n)$ 对所有正整数 $n$ 成立',
      symbols: { P: '关于正整数的命题', n: '正整数', k: '正整数' },
      steps: issueSteps(),
      versions: [],
      updatedAt: now,
    },
  ];
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

// 兼容旧稿：早期保存的数据可能缺少后来新增的字段，逐字段补齐后仍可正常打开。
function normalizeStep(raw: unknown): ProofStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const type: StepType = data.type === 'derivation' || data.type === 'goal' ? data.type : 'premise';
  const references = Array.isArray(data.references) ? data.references.filter((id): id is string => typeof id === 'string') : [];
  return {
    id: asText(data.id) || uid('step'),
    type,
    statement: asText(data.statement),
    rule: asText(data.rule, type === 'premise' ? '前提' : type === 'goal' ? '结论' : '等式变形'),
    references,
    note: asText(data.note),
    counterexample: asText(data.counterexample),
    alternative: asText(data.alternative),
  };
}

function normalizeVersion(raw: unknown): ProofVersion | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const steps = Array.isArray(data.steps) ? data.steps.map(normalizeStep).filter((step): step is ProofStep => step !== null) : [];
  return {
    id: asText(data.id) || uid('version'),
    name: asText(data.name, '未命名版本'),
    createdAt: asText(data.createdAt, new Date().toISOString()),
    steps,
    goal: asText(data.goal),
  };
}

function normalizeDocument(raw: unknown): ProofDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const steps = Array.isArray(data.steps) ? data.steps.map(normalizeStep).filter((step): step is ProofStep => step !== null) : [];
  const symbols = data.symbols && typeof data.symbols === 'object' ? (data.symbols as Record<string, unknown>) : {};
  const versions = Array.isArray(data.versions) ? data.versions.map(normalizeVersion).filter((version): version is ProofVersion => version !== null) : [];
  return {
    id: asText(data.id) || uid('doc'),
    title: asText(data.title, '未命名证明'),
    author: asText(data.author, '本地用户'),
    goal: asText(data.goal),
    symbols: Object.fromEntries(Object.entries(symbols).map(([key, value]) => [key, asText(value)])),
    steps,
    versions,
    updatedAt: asText(data.updatedAt, new Date().toISOString()),
  };
}

function loadDocuments(): ProofDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialDocuments();
    const parsed: unknown = JSON.parse(raw);
    const documents = Array.isArray(parsed)
      ? parsed.map(normalizeDocument).filter((document): document is ProofDocument => document !== null)
      : [];
    return documents.length ? documents : initialDocuments();
  } catch {
    return initialDocuments();
  }
}

export class ProofStore {
  documents = loadDocuments();
  activeId = this.documents[0]?.id ?? '';
  selectedStepId = this.documents[0]?.steps[0]?.id ?? '';
  compareVersionId = '';
  dragStepId = '';
  lastInput: HTMLTextAreaElement | HTMLInputElement | null = null;
  undoStack: ProofDocument[][] = [];
  redoStack: ProofDocument[][] = [];
  toast = '';

  get current(): ProofDocument {
    return this.documents.find((item) => item.id === this.activeId) ?? this.documents[0];
  }

  get selectedStep(): ProofStep | undefined {
    return this.current?.steps.find((step) => step.id === this.selectedStepId);
  }

  get checks(): ProofCheck[] {
    if (!this.current) return [];
    return validate(this.current);
  }

  save(): void {
    this.current.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.documents));
  }

  update(mutator: (document: ProofDocument) => void): void {
    this.undoStack.push(clone(this.documents));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    mutator(this.current);
    this.save();
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(clone(this.documents));
    this.documents = previous;
    this.ensureSelection();
    this.save();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(clone(this.documents));
    this.documents = next;
    this.ensureSelection();
    this.save();
  }

  selectDocument(id: string): void {
    this.activeId = id;
    this.compareVersionId = '';
    this.selectedStepId = this.current?.steps[0]?.id ?? '';
  }

  selectStep(id: string): void {
    this.selectedStepId = id;
  }

  ensureSelection(): void {
    if (!this.documents.some((item) => item.id === this.activeId)) this.activeId = this.documents[0]?.id ?? '';
    if (!this.current?.steps.some((step) => step.id === this.selectedStepId)) {
      this.selectedStepId = this.current?.steps[0]?.id ?? '';
    }
  }

  addDocument(): void {
    const id = uid('doc');
    const document: ProofDocument = {
      id,
      title: '未命名证明',
      author: '本地用户',
      goal: '$A=B$',
      symbols: { A: '待定义对象', B: '待定义对象' },
      steps: [{ id: uid('step'), type: 'premise', statement: '在这里输入前提', rule: '前提', references: [], note: '', counterexample: '', alternative: '' }],
      versions: [],
      updatedAt: new Date().toISOString(),
    };
    this.undoStack.push(clone(this.documents));
    this.documents.unshift(document);
    this.activeId = id;
    this.selectedStepId = document.steps[0].id;
    this.save();
  }

  removeDocument(id: string): void {
    if (this.documents.length <= 1) {
      this.notify('至少保留一个证明文档');
      return;
    }
    this.undoStack.push(clone(this.documents));
    this.documents = this.documents.filter((item) => item.id !== id);
    this.ensureSelection();
    this.save();
  }

  addStep(type: ProofStep['type'] = 'derivation'): void {
    const step: ProofStep = {
      id: uid('step'),
      type,
      statement: type === 'goal' ? '$A=B$' : '输入新的推导式',
      rule: type === 'goal' ? '结论' : '等式变形',
      references: this.selectedStepId ? [this.selectedStepId] : [],
      note: '',
      counterexample: '',
      alternative: '',
    };
    this.update((document) => {
      const selectedIndex = document.steps.findIndex((item) => item.id === this.selectedStepId);
      document.steps.splice(type === 'goal' ? document.steps.length : selectedIndex + 1, 0, step);
    });
    this.selectedStepId = step.id;
  }

  removeStep(id: string): void {
    this.update((document) => {
      document.steps = document.steps.filter((step) => step.id !== id);
      document.steps.forEach((step) => {
        step.references = step.references.filter((reference) => reference !== id);
      });
    });
    this.ensureSelection();
  }

  moveStep(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    this.update((document) => {
      const from = document.steps.findIndex((step) => step.id === sourceId);
      const to = document.steps.findIndex((step) => step.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = document.steps.splice(from, 1);
      document.steps.splice(to, 0, moved);
    });
  }

  updateStep(patch: Partial<ProofStep>): void {
    const id = this.selectedStepId;
    this.update((document) => {
      const step = document.steps.find((item) => item.id === id);
      if (step) Object.assign(step, patch);
    });
  }

  createVersion(): void {
    this.update((document) => {
      const version: ProofVersion = {
        id: uid('version'),
        name: `版本 ${document.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        steps: clone(document.steps),
        goal: document.goal,
      };
      document.versions.unshift(version);
      this.compareVersionId = version.id;
    });
    this.notify('已保存当前证明快照');
  }

  notify(message: string): void {
    this.toast = message;
    window.setTimeout(() => {
      if (this.toast === message) {
        this.toast = '';
        redraw();
      }
    }, 2200);
  }
}

function stripLatexCommands(text: string): string {
  return text.replace(/\\[A-Za-z]+/g, ' ').replace(/[{}_^]/g, ' ');
}

export function validate(document: ProofDocument): ProofCheck[] {
  const checks: ProofCheck[] = [];
  const ids = new Set(document.steps.map((step) => step.id));
  const positionById = new Map(document.steps.map((step, index) => [step.id, index]));
  const symbolKeys = new Set(Object.keys(document.symbols));
  const ignored = new Set(['a', 'A', 'b', 'B', 'n', 'k', 'P', 'Q', 'R', 'x', 'y', 'to', 'text', 'frac', 'sqrt']);
  // 同一步对同一引用只报一次，避免失效引用与引用先后重复计数。
  const flaggedPairs = new Set<string>();

  document.steps.forEach((step, index) => {
    const tokens = stripLatexCommands(step.statement).match(/\b[A-Za-z][A-Za-z0-9']*\b/g) ?? [];
    const unknown = [...new Set(tokens.filter((token) => !symbolKeys.has(token) && !ignored.has(token)))];
    if (unknown.length) {
      checks.push({ id: `symbol-${step.id}`, severity: 'warning', title: '发现未定义符号', detail: `步骤 ${index + 1} 使用了：${unknown.join('、')}`, stepId: step.id });
    }

    step.references.forEach((reference) => {
      const pairKey = `${step.id}->${reference}`;
      if (flaggedPairs.has(pairKey)) return;
      flaggedPairs.add(pairKey);
      if (!ids.has(reference)) {
        checks.push({ id: `missing-${step.id}-${reference}`, severity: 'error', title: '引用步骤不存在', detail: `步骤 ${index + 1} 引用了已删除的步骤，依据已失效。`, stepId: step.id });
        return;
      }
      const referenceIndex = positionById.get(reference) ?? -1;
      if (referenceIndex >= index) {
        checks.push({
          id: `forward-${step.id}-${reference}`,
          severity: 'error',
          title: '引用了排在后面的步骤',
          detail: `步骤 ${index + 1} 不能引用后面的步骤 ${referenceIndex + 1}（拖动排序后请重新核对引用先后）。`,
          stepId: step.id,
        });
      }
    });
  });

  const graph = new Map(document.steps.map((step) => [step.id, step.references.filter((id) => ids.has(id))]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycleStep = new Set<string>();
  const visit = (id: string, path: string[]): boolean => {
    if (visiting.has(id)) {
      path.slice(path.indexOf(id)).forEach((item) => cycleStep.add(item));
      return true;
    }
    if (visited.has(id)) return false;
    visiting.add(id);
    const hasCycle = (graph.get(id) ?? []).some((next) => visit(next, [...path, id]));
    visiting.delete(id);
    visited.add(id);
    return hasCycle;
  };
  [...graph.keys()].forEach((id) => visit(id, []));
  if (cycleStep.size) {
    checks.push({ id: 'cycle', severity: 'error', title: '检测到循环引用', detail: '引用链形成闭环，请调整步骤关系。', stepId: [...cycleStep][0] });
  }

  const goalStep = document.steps.find((step) => step.type === 'goal' && step.rule === '结论');
  if (!goalStep) {
    checks.push({ id: 'goal-missing', severity: 'error', title: '目标未被证明', detail: '请添加“结论”类型的最终步骤。' });
  } else {
    const goalIndex = positionById.get(goalStep.id) ?? 0;

    // 收集结论沿引用链实际依赖到的全部步骤（含指向后面或已删除的失效引用）。
    const closure = new Set<string>();
    const collect = (id: string): void => {
      if (closure.has(id)) return;
      closure.add(id);
      const step = document.steps.find((item) => item.id === id);
      step?.references.forEach(collect);
    };
    collect(goalStep.id);

    // 逐层核对依据：前提本身有据；非前提步骤的每条引用都必须来自已落地的前序步骤。
    const grounded = new Set<string>();
    let progressed = true;
    while (progressed) {
      progressed = false;
      closure.forEach((id) => {
        if (grounded.has(id)) return;
        const step = document.steps.find((item) => item.id === id);
        if (!step) return;
        const bases = step.references.filter((reference) => ids.has(reference) && (positionById.get(reference) ?? -1) < (positionById.get(id) ?? -1));
        if (step.type === 'premise' || (bases.length > 0 && bases.every((reference) => grounded.has(reference)))) {
          grounded.add(id);
          progressed = true;
        }
      });
    }

    // 结论链上未落地的非前提步骤里，引用的前序步骤都已落地（或没有可用依据）者，就是断点本身。
    const breaks = [...closure]
      .filter((id) => !grounded.has(id))
      .map((id) => document.steps.find((step) => step.id === id))
      .filter((step): step is ProofStep => step !== undefined && step.type !== 'premise')
      .filter((step) => {
        const index = positionById.get(step.id) ?? 0;
        return step.references
          .filter((reference) => ids.has(reference) && (positionById.get(reference) ?? -1) < index)
          .every((reference) => grounded.has(reference));
      })
      .sort((a, b) => (positionById.get(a.id) ?? 0) - (positionById.get(b.id) ?? 0));

    if (!grounded.has(goalStep.id) && breaks.length) {
      const labels = breaks.map((step) => `步骤 ${(positionById.get(step.id) ?? 0) + 1}`).join('、');
      const goalBases = goalStep.references.filter((reference) => ids.has(reference) && (positionById.get(reference) ?? -1) < goalIndex);
      const goalIsBreak = breaks.some((step) => step.id === goalStep.id);
      let detail: string;
      if (goalIsBreak && goalBases.length === 0) {
        detail = `最终结论（步骤 ${goalIndex + 1}）没有引用任何前序步骤，结论缺少依据。`;
      } else if (goalIsBreak) {
        detail = `最终结论（步骤 ${goalIndex + 1}）引用的依据未连成完整推导链。`;
      } else {
        detail = `结论的引用链在 ${labels} 处中断：该步骤引用的依据无法继续回溯到前提。`;
      }
      checks.push({
        id: 'goal-ungrounded',
        severity: 'error',
        title: goalIsBreak && goalBases.length === 0 ? '结论尚无推导支撑' : '结论依据链存在断点',
        detail,
        stepId: breaks[0]?.id ?? goalStep.id,
      });
    }
  }

  if (!checks.some((check) => check.severity === 'error')) {
    checks.push({ id: 'proof-ok', severity: 'info', title: '结构检查通过', detail: '引用均指向前面的步骤，且结论可沿引用链回溯到前提。' });
  }
  return checks;
}

export function compareVersion(document: ProofDocument, version: ProofVersion) {
  const result = [];
  const size = Math.max(document.steps.length, version.steps.length);
  for (let index = 0; index < size; index += 1) {
    const before = version.steps[index]?.statement ?? '';
    const after = document.steps[index]?.statement ?? '';
    const kind = !before ? 'added' : !after ? 'removed' : before === after ? 'same' : 'changed';
    result.push({ kind, label: `步骤 ${index + 1}`, before, after } as const);
  }
  return result;
}

export function createId(prefix: string): string {
  return uid(prefix);
}

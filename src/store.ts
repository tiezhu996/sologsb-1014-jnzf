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

function normalizeStep(raw: Partial<ProofStep> | undefined, index: number, fallbackId: string): ProofStep {
  const stepType: StepType = raw?.type === 'derivation' || raw?.type === 'goal' ? raw.type : 'premise';
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : `${fallbackId}-${index}`,
    type: stepType,
    statement: typeof raw?.statement === 'string' ? raw.statement : '',
    rule: typeof raw?.rule === 'string' && raw.rule ? raw.rule : stepType === 'goal' ? '结论' : stepType === 'premise' ? '前提' : '等式变形',
    references: Array.isArray(raw?.references) ? raw!.references.filter((id): id is string => typeof id === 'string') : [],
    note: typeof raw?.note === 'string' ? raw.note : '',
    counterexample: typeof raw?.counterexample === 'string' ? raw.counterexample : '',
    alternative: typeof raw?.alternative === 'string' ? raw.alternative : '',
  };
}

// 修复拖拽、旧版本可能产生的重复 id；引用保持指向首个同 id 的步骤。
function dedupeStepIds(steps: ProofStep[]): ProofStep[] {
  const seen = new Set<string>();
  steps.forEach((step) => {
    if (seen.has(step.id)) step.id = uid('step');
    seen.add(step.id);
  });
  return steps;
}

function normalizeVersion(raw: Partial<ProofVersion> | undefined, index: number): ProofVersion {
  const steps = (Array.isArray(raw?.steps) ? raw!.steps : []).map((step, stepIndex) =>
    normalizeStep(step as Partial<ProofStep>, stepIndex, `doc-version-${index}-step`),
  );
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : uid('version'),
    name: typeof raw?.name === 'string' && raw.name ? raw.name : `版本 ${index + 1}`,
    createdAt: typeof raw?.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
    goal: typeof raw?.goal === 'string' ? raw.goal : '',
    steps: dedupeStepIds(steps),
  };
}

function normalizeDocument(raw: Partial<ProofDocument>, index: number): ProofDocument {
  const now = new Date().toISOString();
  const steps = (Array.isArray(raw.steps) ? raw.steps : []).map((step, stepIndex) =>
    normalizeStep(step as Partial<ProofStep>, stepIndex, `doc-${index}-step`),
  );
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid('doc'),
    title: typeof raw.title === 'string' && raw.title ? raw.title : '未命名证明',
    author: typeof raw.author === 'string' && raw.author ? raw.author : '本地用户',
    goal: typeof raw.goal === 'string' ? raw.goal : '',
    symbols: raw.symbols && typeof raw.symbols === 'object'
      ? Object.fromEntries(Object.entries(raw.symbols).filter(([, meaning]) => typeof meaning === 'string'))
      : {},
    steps: dedupeStepIds(steps),
    versions: Array.isArray(raw.versions) ? raw.versions.map((version, versionIndex) => normalizeVersion(version as Partial<ProofVersion>, versionIndex)) : [],
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : now,
  };
}

function loadDocuments(): ProofDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialDocuments();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length) {
      // 以前保存的稿子字段可能缺失或带有拖拽产生的重复 id，统一补齐后仍可打开。
      return parsed.map((item, index) => normalizeDocument((item ?? {}) as Partial<ProofDocument>, index));
    }
    return initialDocuments();
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
  const steps = document.steps;
  const indexOf = new Map<string, number>();
  steps.forEach((step, index) => indexOf.set(step.id, index));
  const symbolKeys = new Set(Object.keys(document.symbols));
  const ignored = new Set(['a', 'A', 'b', 'B', 'n', 'k', 'P', 'Q', 'R', 'x', 'y', 'to', 'text', 'frac', 'sqrt']);
  const isConclusion = (step: ProofStep) => step.type === 'goal' && step.rule === '结论';
  const stepName = (step: ProofStep) => `步骤 ${(indexOf.get(step.id) ?? -1) + 1}`;

  steps.forEach((step, index) => {
    const tokens = stripLatexCommands(step.statement).match(/\b[A-Za-z][A-Za-z0-9']*\b/g) ?? [];
    const unknown = [...new Set(tokens.filter((token) => !symbolKeys.has(token) && !ignored.has(token)))];
    if (unknown.length) {
      checks.push({ id: `symbol-${step.id}`, severity: 'warning', title: '发现未定义符号', detail: `步骤 ${index + 1} 使用了：${unknown.join('、')}`, stepId: step.id });
    }

    // 每一步只能引用排在它前面的步骤；重复登记同一引用也要点出来。
    const seen = new Set<string>();
    [...new Set(step.references)].forEach((reference) => {
      if (!indexOf.has(reference)) {
        checks.push({ id: `missing-${step.id}-${reference}`, severity: 'error', title: '引用步骤不存在', detail: `步骤 ${index + 1} 引用了已删除的步骤 ${reference}`, stepId: step.id });
        return;
      }
      const referenceIndex = indexOf.get(reference)!;
      if (referenceIndex === index) {
        checks.push({ id: `self-${step.id}`, severity: 'error', title: '步骤引用了自身', detail: `步骤 ${index + 1} 不能以自己为依据。`, stepId: step.id });
      } else if (referenceIndex > index) {
        checks.push({
          id: `forward-${step.id}-${reference}`,
          severity: 'error',
          title: '引用了排在后面的步骤',
          detail: `步骤 ${index + 1} 不能引用排在后面的步骤 ${referenceIndex + 1}，请只选择前面的步骤作为依据。`,
          stepId: step.id,
        });
      }
      if (seen.has(reference)) {
        checks.push({ id: `dup-ref-${step.id}-${reference}`, severity: 'warning', title: '重复引用同一步骤', detail: `步骤 ${index + 1} 重复引用了步骤 ${referenceIndex + 1}。`, stepId: step.id });
      }
      seen.add(reference);
    });
  });

  // 只保留“指向存在的、排在前面的步骤”的边，用于循环检查和依据回溯。
  const earlierRefs = new Map<string, string[]>();
  const graph = new Map<string, string[]>();
  steps.forEach((step, index) => {
    const unique = [...new Set(step.references)];
    graph.set(step.id, unique.filter((id) => indexOf.has(id)));
    earlierRefs.set(step.id, unique.filter((id) => (indexOf.get(id) ?? Number.POSITIVE_INFINITY) < index));
  });
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
    const ordered = [...cycleStep].sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0));
    const first = ordered[0];
    const names = ordered.map((id) => `步骤 ${(indexOf.get(id) ?? -1) + 1}`).join(' → ');
    checks.push({ id: 'cycle', severity: 'error', title: '检测到循环引用', detail: `引用链形成闭环（${names}），请调整步骤关系。`, stepId: first });
  }

  // grounded：沿“只能向前”的引用边，能一路回溯到前提（无需引用的 premise）的步骤才算有据。
  const grounded = new Set<string>();
  steps.forEach((step) => {
    if (step.type === 'premise') grounded.add(step.id);
    else if (earlierRefs.get(step.id)!.length > 0 && earlierRefs.get(step.id)!.every((id) => grounded.has(id))) grounded.add(step.id);
  });

  // 直接点名缺少依据的那一步：非前提、没有任何有效前置依据的步骤即断点本身。
  const roots = steps.filter((step) => step.type !== 'premise' && !grounded.has(step.id) && earlierRefs.get(step.id)!.length === 0);
  roots.forEach((step) => {
    const conclusion = isConclusion(step);
    checks.push({
      id: conclusion ? 'goal-unlinked' : `ungrounded-${step.id}`,
      severity: 'error',
      title: conclusion ? '结论缺少依据' : '步骤缺少依据',
      detail: conclusion
        ? `${stepName(step)}没有引用任何前置步骤，结论无法回到前提。`
        : `${stepName(step)}是${step.type === 'goal' ? '目标' : '推导'}却没有有效的前置依据，请引用前面的步骤作为依据。`,
      stepId: step.id,
    });
  });

  const goalStep = steps.find(isConclusion);
  if (!goalStep) {
    checks.push({ id: 'goal-missing', severity: 'error', title: '目标未被证明', detail: '请添加“结论”类型的最终步骤。' });
  } else if (!grounded.has(goalStep.id) && earlierRefs.get(goalStep.id)!.length > 0) {
    // 结论挂了引用，但引用链在某处断了：沿链找到根断点（最早失去依据的那一步）并点名。
    const ancestors = new Set<string>();
    const stack = earlierRefs.get(goalStep.id)!.slice();
    while (stack.length) {
      const id = stack.pop()!;
      if (ancestors.has(id)) continue;
      ancestors.add(id);
      earlierRefs.get(id)?.forEach((ref) => stack.push(ref));
    }
    const broken = [...ancestors]
      .filter((id) => {
        const step = steps[indexOf.get(id)!];
        if (grounded.has(id) || step.type === 'premise') return false;
        // 根断点：它自己没有有效依据（所引用的前置步骤全部有据时它自身就该有据）。
        return earlierRefs.get(id)!.length === 0 || earlierRefs.get(id)!.every((ref) => grounded.has(ref));
      })
      .sort((a, b) => indexOf.get(a)! - indexOf.get(b)!)[0];
    const brokenStep = broken ? steps[indexOf.get(broken)!] : undefined;
    checks.push({
      id: 'goal-chain-broken',
      severity: 'error',
      title: '结论依据链存在断点',
      detail: brokenStep
        ? `结论的依据链在${stepName(brokenStep)}中断：${stepName(brokenStep)}缺少可回溯到前提的依据，结论无法成立。`
        : `${stepName(goalStep)}的依据无法沿引用链回到前提。`,
      stepId: brokenStep?.id ?? goalStep.id,
    });
  }

  if (!checks.some((check) => check.severity === 'error')) {
    checks.push({ id: 'proof-ok', severity: 'info', title: '结构检查通过', detail: '所有引用均指向前面的步骤，结论可沿引用链回到前提。' });
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

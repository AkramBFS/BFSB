import katex from 'katex';

/**
 * Local built-in ML & Math formula library for instant offline slash-command insertion.
 */
export const FORMULA_LIBRARY = [
  {
    id: 'linear-hypothesis',
    command: '/hypothesis',
    aliases: ['/linear', 'linear hypothesis', 'linear model', 'h_theta'],
    title: 'Linear hypothesis',
    category: 'Linear & Logistic',
    latex: 'h_\\theta(x) = \\theta_0 + \\theta_1 x_1 + \\dots + \\theta_n x_n = \\theta^T x',
    displayMode: true,
  },
  {
    id: 'cost-function',
    command: '/cost',
    aliases: ['/j', 'cost function', 'squared error cost', 'j(theta)'],
    title: 'Squared error cost function',
    category: 'Loss Functions',
    latex: 'J(\\theta) = \\frac{1}{2m} \\sum_{i=1}^{m} \\left(h_\\theta(x^{(i)}) - y^{(i)}\\right)^2',
    displayMode: true,
  },
  {
    id: 'gradient-descent',
    command: '/gd',
    aliases: ['/gradient', 'gradient descent', 'update rule', 'parameter update'],
    title: 'Gradient descent update',
    category: 'Optimization',
    latex: '\\theta_j := \\theta_j - \\alpha \\frac{\\partial}{\\partial \\theta_j} J(\\theta)',
    displayMode: true,
  },
  {
    id: 'sigmoid',
    command: '/sigmoid',
    aliases: ['/logistic', 'sigmoid function', 'logistic activation'],
    title: 'Sigmoid / logistic function',
    category: 'Linear & Logistic',
    latex: '\\sigma(z) = \\frac{1}{1 + e^{-z}}',
    displayMode: true,
  },
  {
    id: 'softmax',
    command: '/softmax',
    aliases: ['softmax', 'multiclass probability', 'boltzmann'],
    title: 'Softmax function',
    category: 'Deep Learning',
    latex: '\\text{softmax}(z_i) = \\frac{e^{z_i}}{\\sum_{j=1}^{K} e^{z_j}}',
    displayMode: true,
  },
  {
    id: 'mse',
    command: '/mse',
    aliases: ['mean squared error', 'l2 loss', 'quadratic loss'],
    title: 'Mean squared error (MSE)',
    category: 'Loss Functions',
    latex: '\\text{MSE} = \\frac{1}{n} \\sum_{i=1}^{n} (y_i - \\hat{y}_i)^2',
    displayMode: true,
  },
  {
    id: 'cross-entropy',
    command: '/crossentropy',
    aliases: ['/bce', '/ce', 'cross entropy', 'binary cross entropy', 'log loss'],
    title: 'Binary cross-entropy loss',
    category: 'Loss Functions',
    latex: '\\mathcal{L}(\\theta) = -\\frac{1}{m} \\sum_{i=1}^{m} \\left[ y^{(i)} \\log(\\hat{y}^{(i)}) + (1 - y^{(i)}) \\log(1 - \\hat{y}^{(i)}) \\right]',
    displayMode: true,
  },
  {
    id: 'normal-equation',
    command: '/normal',
    aliases: ['/ols', 'normal equation', 'closed form linear regression', 'least squares'],
    title: 'Normal equation (OLS)',
    category: 'Linear & Logistic',
    latex: '\\theta = (X^T X)^{-1} X^T y',
    displayMode: true,
  },
  {
    id: 'ridge-cost',
    command: '/ridge',
    aliases: ['/l2reg', 'regularized cost', 'l2 regularization', 'ridge regression'],
    title: 'Regularized cost (L2 / Ridge)',
    category: 'Loss Functions',
    latex: 'J(\\theta) = \\frac{1}{2m} \\left[ \\sum_{i=1}^{m} \\left(h_\\theta(x^{(i)}) - y^{(i)}\\right)^2 + \\lambda \\sum_{j=1}^{n} \\theta_j^2 \\right]',
    displayMode: true,
  },
  {
    id: 'lasso-cost',
    command: '/lasso',
    aliases: ['/l1reg', 'l1 regularization', 'lasso regression', 'sparse cost'],
    title: 'Regularized cost (L1 / Lasso)',
    category: 'Loss Functions',
    latex: 'J(\\theta) = \\frac{1}{2m} \\sum_{i=1}^{m} \\left(h_\\theta(x^{(i)}) - y^{(i)}\\right)^2 + \\lambda \\sum_{j=1}^{n} |\\theta_j|',
    displayMode: true,
  },
  {
    id: 'bayes',
    command: '/bayes',
    aliases: ['bayes theorem', 'posterior probability', 'conditional probability'],
    title: "Bayes' theorem",
    category: 'Probability & Stats',
    latex: 'P(A \\mid B) = \\frac{P(B \\mid A)\\, P(A)}{P(B)}',
    displayMode: true,
  },
  {
    id: 'chain-rule',
    command: '/backprop',
    aliases: ['/chainrule', 'chain rule', 'backpropagation', 'partial derivative'],
    title: 'Backpropagation chain rule',
    category: 'Deep Learning',
    latex: '\\frac{\\partial \\mathcal{L}}{\\partial W^{(l)}} = \\frac{\\partial \\mathcal{L}}{\\partial a^{(l)}} \\cdot \\frac{\\partial a^{(l)}}{\\partial z^{(l)}} \\cdot \\frac{\\partial z^{(l)}}{\\partial W^{(l)}}',
    displayMode: true,
  },
  {
    id: 'attention',
    command: '/attention',
    aliases: ['/transformer', 'scaled dot-product attention', 'self attention', 'qkv'],
    title: 'Scaled dot-product attention',
    category: 'Deep Learning',
    latex: '\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V',
    displayMode: true,
  },
  {
    id: 'kl-divergence',
    command: '/kl',
    aliases: ['kl divergence', 'kullback leibler', 'relative entropy'],
    title: 'KL divergence',
    category: 'Probability & Stats',
    latex: 'D_{\\text{KL}}(P \\parallel Q) = \\sum_{x \\in \\mathcal{X}} P(x) \\log \\left(\\frac{P(x)}{Q(x)}\\right)',
    displayMode: true,
  },
  {
    id: 'gaussian',
    command: '/gaussian',
    aliases: ['/normal-dist', 'normal distribution', 'gaussian pdf', 'bell curve'],
    title: 'Gaussian distribution PDF',
    category: 'Probability & Stats',
    latex: '\\mathcal{N}(x \\mid \\mu, \\sigma^2) = \\frac{1}{\\sqrt{2\\pi \\sigma^2}} \\exp\\left(-\\frac{(x - \\mu)^2}{2\\sigma^2}\\right)',
    displayMode: true,
  },
  {
    id: 'adam',
    command: '/adam',
    aliases: ['adam optimizer', 'adaptive moment estimation', 'momentum'],
    title: 'Adam optimizer update',
    category: 'Optimization',
    latex: '\\theta_{t+1} = \\theta_t - \\frac{\\alpha}{\\sqrt{\\hat{v}_t} + \\epsilon} \\hat{m}_t',
    displayMode: true,
  },
  {
    id: 'relu',
    command: '/relu',
    aliases: ['rectified linear unit', 'relu activation'],
    title: 'ReLU activation',
    category: 'Deep Learning',
    latex: '\\text{ReLU}(z) = \\max(0, z)',
    displayMode: false,
  },
  {
    id: 'l2-norm',
    command: '/norm',
    aliases: ['/l2', 'euclidean norm', 'vector magnitude'],
    title: 'Euclidean (L2) norm',
    category: 'Linear Algebra',
    latex: '\\|x\\|_2 = \\sqrt{\\sum_{i=1}^{n} x_i^2} = \\sqrt{x^T x}',
    displayMode: false,
  },
  {
    id: 'cosine-sim',
    command: '/cosine',
    aliases: ['cosine similarity', 'dot product angle'],
    title: 'Cosine similarity',
    category: 'Linear Algebra',
    latex: '\\text{cos}(\\theta) = \\frac{u \\cdot v}{\\|u\\|_2 \\|v\\|_2}',
    displayMode: true,
  },
  {
    id: 'matrix-2x2',
    command: '/matrix',
    aliases: ['bmatrix', '2x2 matrix', 'linear algebra matrix'],
    title: '2×2 Matrix template',
    category: 'Linear Algebra',
    latex: '\\begin{bmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{bmatrix}',
    displayMode: true,
  },
];

/**
 * Search the local formula library by slash trigger or natural-language query.
 */
export function searchFormulaLibrary(rawQuery = '') {
  const q = rawQuery.trim().toLowerCase();
  if (!q || q === '/') return FORMULA_LIBRARY;

  const withoutSlash = q.replace(/^\//, '').trim();
  if (!withoutSlash) return FORMULA_LIBRARY;

  return FORMULA_LIBRARY.filter((item) => {
    const cmdMatch = item.command.toLowerCase().includes(withoutSlash);
    const titleMatch = item.title.toLowerCase().includes(withoutSlash);
    const catMatch = item.category.toLowerCase().includes(withoutSlash);
    const aliasMatch = item.aliases.some((a) => a.toLowerCase().includes(withoutSlash));
    return cmdMatch || titleMatch || catMatch || aliasMatch;
  });
}

/**
 * Find an exact or direct local match if the user typed a known command or staple name.
 */
export function findExactLocalFormula(rawQuery = '') {
  const q = rawQuery.trim().toLowerCase();
  const withoutSlash = q.replace(/^\//, '').trim();
  if (!withoutSlash) return null;

  return (
    FORMULA_LIBRARY.find(
      (item) =>
        item.command.toLowerCase() === `/${withoutSlash}` ||
        item.title.toLowerCase() === withoutSlash ||
        item.aliases.some((a) => a.toLowerCase() === `/${withoutSlash}` || a.toLowerCase() === withoutSlash)
    ) || null
  );
}

/**
 * Clean raw AI model output (strip markdown fences, chain-of-thought preamble,
 * duplicate blocks, stray wrappers) and validate with KaTeX before inserting into the note.
 */
export function cleanAndValidateLatex(rawText = '', preferredDisplayMode = 'block') {
  let cleaned = String(rawText || '').trim();

  // 1. Extract from ```latex ... ```, ```markdown ... ```, ```katex ... ```, or ``` ... ``` code blocks if present
  const fenceMatch = cleaned.match(/```(?:latex|tex|math|markdown|katex)?\s*\n?([\s\S]*?)\n?```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  } else {
    // Strip unclosed leading or trailing code fences if present
    cleaned = cleaned.replace(/^```(?:latex|tex|math|markdown|katex)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '').trim();
  }

  // 2. If block math ($$...$$) exists inside the output with chain-of-thought preamble or duplicates
  const blockMathMatches = [...cleaned.matchAll(/\$\$[\s\S]+?\$\$/g)];
  if (blockMathMatches.length > 0) {
    if (blockMathMatches[0].index > 30) {
      // Extract the final block equation when preceded by chain-of-thought reasoning
      cleaned = blockMathMatches[blockMathMatches.length - 1][0].trim();
    } else if (
      blockMathMatches.length >= 2 &&
      blockMathMatches[0][0].trim() === blockMathMatches[1][0].trim()
    ) {
      // Deduplicate adjacent identical block equations
      cleaned = blockMathMatches[0][0].trim();
    }
  } else {
    // If only inline math ($...$) exists with preceding reasoning preamble (> 30 chars)
    const inlineMathMatches = [...cleaned.matchAll(/\$[^$\n]+?\$/g)];
    if (inlineMathMatches.length > 0 && inlineMathMatches[0].index > 30) {
      cleaned = inlineMathMatches[inlineMathMatches.length - 1][0].trim();
    }
  }

  // 3. Remove common conversational preamble lines if any slipped through
  cleaned = cleaned
    .replace(/^(here\s+is\s+the\s+(latex|formula|equation|math)\s*:?\s*)/i, '')
    .replace(/^(latex\s*:?\s*)/i, '')
    .trim();

  // 4. Detect if wrapped in $$...$$, \[...\], $...$, or \(...\)
  let detectedBlock = preferredDisplayMode === 'block';
  if (cleaned.startsWith('$$') && cleaned.endsWith('$$') && cleaned.length > 4) {
    cleaned = cleaned.slice(2, -2).trim();
    detectedBlock = true;
  } else if (cleaned.startsWith('\\[') && cleaned.endsWith('\\]') && cleaned.length > 4) {
    cleaned = cleaned.slice(2, -2).trim();
    detectedBlock = true;
  } else if (cleaned.startsWith('\\(') && cleaned.endsWith('\\)') && cleaned.length > 4) {
    cleaned = cleaned.slice(2, -2).trim();
    detectedBlock = false;
  } else if (
    cleaned.startsWith('$') &&
    cleaned.endsWith('$') &&
    !cleaned.startsWith('$$') &&
    cleaned.length > 2
  ) {
    cleaned = cleaned.slice(1, -1).trim();
    detectedBlock = false;
  }

  if (cleaned.includes('\\begin{') || cleaned.includes('\n') || cleaned.length > 42) {
    detectedBlock = preferredDisplayMode === 'inline' ? false : true;
  }

  // 5. Validate with KaTeX
  let isValid = true;
  let katexError = null;
  if (!cleaned) {
    isValid = false;
    katexError = 'Empty formula returned.';
  } else {
    try {
      katex.renderToString(cleaned, {
        throwOnError: true,
        displayMode: detectedBlock,
      });
    } catch (err) {
      isValid = false;
      katexError = err?.message
        ? err.message.replace(/^KaTeX parse error:\s*/i, '')
        : 'LaTeX syntax needs adjustment.';
    }
  }

  const wrapped = detectedBlock ? `$$\n${cleaned}\n$$` : `$${cleaned}$`;

  return {
    latex: cleaned,
    wrapped,
    isValid,
    error: katexError,
    displayMode: detectedBlock ? 'block' : 'inline',
  };
}

/**
 * Strips code fences, chain-of-thought commentary, and preamble, returning ONLY the clean KaTeX math string
 * wrapped in `$$...$$` or `$...$` (compatible with `soheib-ai-export`'s `cleanLatex(rawText)` signature).
 */
export function cleanLatex(rawText = '') {
  if (!rawText || !String(rawText).trim()) return '';
  const raw = String(rawText).trim();
  const isMarkdownDoc =
    !raw.includes('$') &&
    (raw.startsWith('#') || raw.startsWith('-') || raw.startsWith('*'));
  if (isMarkdownDoc) return raw;

  const res = cleanAndValidateLatex(raw, 'block');
  if (!res.latex) return '';
  return res.displayMode === 'block' ? `$$${res.latex}$$` : `$${res.latex}$`;
}

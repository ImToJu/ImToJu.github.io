/*╔════════════════════════════════════════════════════════════╗
  ┃  1.  GLOBAL STATE & CONFIGURATION                          ┃
  ╚════════════════════════════════════════════════════════════╝*/
const LEVEL_GAP = 100;   // vertical distance between generations
const SLOT_GAP = 70;    // horizontal distance between two adjacent leaves

/*  tree model and run-time sets  */
let rootNode = {
    id: 0, label: 'Root',
    children: [
        {
            id: 1, label: '1',
            children: [
                { id: 3, label: '3', children: [] },
                { id: 4, label: '4', children: [] },
            ]
        },
        {
            id: 2, label: '2',
            children: [
                { id: 5, label: '5', children: [] },
                { id: 6, label: '6', children: [] },
            ]
        },
    ]
};
let nodesHasFile = new Set([1]);   // already owns the file
let nodesReadyToPass = new Set([1]);   // can send this round
let nodesReceivedFileThisRound = new Set();      // highlight only 1 step
let allNodes = [];                           // flattened view of tree
let nodeElements = {};                           // id → div
const NODE_ID_START = 1;
let nodeIdCounter = NODE_ID_START;

/*  UI state  */
let fileAnimating = false;
let autoPlayInterval = null;
let selectedNode = null;

/*  zoom / pan state  */

/*  DOM shortcuts  */
const viewport = document.getElementById('treeViewport');
const container = document.getElementById('treeContainer');
const nextBtn = document.getElementById('nextBtn');
const resetBtn = document.getElementById('resetBtn');
const clearBtn = document.getElementById('clearBtn');
const playBtn = document.getElementById('playBtn');
const addChildBtn = document.getElementById('addChildBtn');
const deleteBtn = document.getElementById('deleteBtn');
const messageEl = document.getElementById('message');

/*╔════════════════════════════════════════════════════════════╗
  ┃  2.  INITIALISATION                                        ┃
  ╚════════════════════════════════════════════════════════════╝*/
document.head.insertAdjacentHTML(
    'beforeend',
    '<style>.node{transition:left .25s ease, top .25s ease;}</style>'
);
const resizeObs = new ResizeObserver(() => renderTree());
resizeObs.observe(container);

initializeVisualization();

/*╔════════════════════════════════════════════════════════════╗
  ┃  3.  CORE RENDER / LAYOUT FUNCTIONS                        ┃
  ╚════════════════════════════════════════════════════════════╝*/
function initializeVisualization() {
    /* reset state */
    nodesHasFile = new Set([0]);
    nodesReadyToPass = new Set([0]);
    nodesReceivedFileThisRound.clear();
    selectedNode = null;
    autoPlayInterval && clearInterval(autoPlayInterval);

    /* draw first time */
    renderTree();
    updateNodeStyles();
    messageEl.textContent =
        'Root node has the file. Press "Next Step" to start passing.';
    nextBtn.disabled = false;
    playBtn.textContent = 'Auto Play';
}

function renderTree() {
    countLeaves(rootNode);                               // layout pass 1
    const pos = new Map();
    const tw = rootNode._leaves * SLOT_GAP;
    const th = (maxDepth(rootNode) + 1) * LEVEL_GAP;
    container.dataset.treeW = tw;
    container.dataset.treeH = th;
    const startX = (container.offsetWidth - tw) / 2;
    placeNodes(rootNode, 0, startX, pos);                // layout pass 2

    /* rebuild DOM */
    container.innerHTML = '';
    nodeElements = {}; allNodes = [];

    (function drawNode(node, parentId) {
        allNodes.push(node);

        const d = document.createElement('div');
        d.className = 'node' + (node.id === 0 ? ' root' : '');
        d.textContent = node.label || node.id;
        d.dataset.id = node.id; d.dataset.parentId = parentId;
        d.style.left = `${pos.get(node.id).x}px`;
        d.style.top = `${pos.get(node.id).y}px`;
        container.appendChild(d);
        nodeElements[node.id] = d;

        /* click selects */
        d.addEventListener('click', e => {
            e.stopPropagation();
            Object.values(nodeElements).forEach(el => el.classList.remove('selected'));
            d.classList.add('selected');
            selectedNode = node;
        });
        if (selectedNode?.id === node.id) d.classList.add('selected');

        node.children.forEach(c => drawNode(c, node.id));
    })(rootNode, null);

    drawEdges();
    updateNodeStyles();
}

function countLeaves(node) {
    node._leaves = node.children.length
        ? node.children.reduce((s, c) => s + countLeaves(c), 0)
        : 1;
    return node._leaves;
}
function placeNodes(node, depth, x0, pos) {
    const half = (node._leaves * SLOT_GAP) / 2;
    pos.set(node.id, { x: x0 + half - SLOT_GAP / 2, y: depth * LEVEL_GAP });
    let childX = x0;
    node.children.forEach(c => {
        placeNodes(c, depth + 1, childX, pos);
        childX += c._leaves * SLOT_GAP;
    });
}

/*╔════════════════════════════════════════════════════════════╗
  ┃  4.  NODE / EDGE DRAWING HELPERS                           ┃
  ╚════════════════════════════════════════════════════════════╝*/
function drawEdges() {
    container.querySelectorAll('.edge').forEach(e => e.remove());
    allNodes.forEach(n => {
        if (n.id === 0) return;
        const child = nodeElements[n.id];
        const parent = nodeElements[child.dataset.parentId];
        if (!child || !parent) return;

        const px = parseInt(parent.style.left) + 30,
            py = parseInt(parent.style.top) + 30,
            cx = parseInt(child.style.left) + 30,
            cy = parseInt(child.style.top) + 30;
        const len = Math.hypot(cx - px, cy - py);
        const ang = Math.atan2(cy - py, cx - px);

        const e = document.createElement('div');
        e.className = 'edge';
        Object.assign(e.style, {
            width: `${len}px`, left: `${px}px`, top: `${py}px`,
            transform: `rotate(${ang}rad)`
        });
        container.insertBefore(e, container.firstChild);
    });
}
function updateNodeStyles() {
    allNodes.forEach(n => {
        const el = nodeElements[n.id];
        el.classList.remove('has-file', 'received-file', 'selected');
        if (selectedNode?.id === n.id) el.classList.add('selected');
        else if (nodesReceivedFileThisRound.has(n.id)) el.classList.add('received-file');
        else if (nodesHasFile.has(n.id)) el.classList.add('has-file');
    });
}

/*╔════════════════════════════════════════════════════════════╗
  ┃  5.  ZOOM / PAN (kept after layout so it knows bounds)     ┃
  ╚════════════════════════════════════════════════════════════╝*/

function maxDepth(n, d = 0) { return n.children.length ? Math.max(...n.children.map(c => maxDepth(c, d + 1))) : d; }

/*╔════════════════════════════════════════════════════════════╗
  ┃  6.  FILE PASSING MECHANICS                                ┃
  ╚════════════════════════════════════════════════════════════╝*/

function determineNodesThatCanPassTo() {
    const strategy = document.getElementById('passingStrategy').value;
    const eligibleNodes = new Set();

    switch (strategy) {
        case 'first':
            // Logic for passing to one child
            // choose one child of the first node that can pass
            for (const id of nodesReadyToPass) {
                const node = findNodeById(rootNode, id);
                if (node && node.children.length > 0) {
                    // choose the child that is not already passed
                    const child = node.children.find(c => !nodesHasFile.has(c.id));
                    if (child) {
                        eligibleNodes.add(child.id);
                        break; // Stop after the first eligible child
                    }
                }
            }
            return eligibleNodes;
        case 'random':
            // Random selection logic
            if (nodesReadyToPass.size > 0) {
                // For each node that can pass, randomly select one child that haven't receive the file
                nodesReadyToPass.forEach(id => {
                    const node = findNodeById(rootNode, id);
                    if (node && node.children.length > 0) {
                        const eligibleChildren = node.children.filter(c => !nodesHasFile.has(c.id));
                        if (eligibleChildren.length > 0) {
                            const randomChild = eligibleChildren[Math.floor(Math.random() * eligibleChildren.length)];
                            eligibleNodes.add(randomChild.id);
                        }
                    }
                });
            }
            return eligibleNodes;
        case 'largest':
            // Logic for passing to the child has the most children
            nodesReadyToPass.forEach(id => {
                const node = findNodeById(rootNode, id);
                if (node && node.children.length > 0) {
                    // Find the child with the most children that hasn't received the file
                    const eligibleChildren = node.children.filter(c => !nodesHasFile.has(c.id));
                    if (eligibleChildren.length > 0) {
                        const childWithMostChildren = eligibleChildren.reduce((prev, curr) => {
                            return (curr.children.length > prev.children.length) ? curr : prev;
                        });
                        eligibleNodes.add(childWithMostChildren.id);
                    }
                }
            });
            return eligibleNodes;

        case 'all':
        default:
            // Default behavior - all children nodes pass
            nodesReadyToPass.forEach(id => {
                const node = findNodeById(rootNode, id);
                if (node) {
                    node.children.forEach(child => {
                        if (!nodesHasFile.has(child.id)) eligibleNodes.add(child.id);
                    });
                }
            });
            return eligibleNodes;
    }
}

async function nextStep() {
    if (fileAnimating) return;

    // Check if we're done
    const allNodesCount = allNodes.length;
    if (nodesHasFile.size >= allNodesCount) {
        messageEl.textContent = "All nodes have received the file!";
        nextBtn.disabled = true;
        if (autoPlayInterval) {
            clearInterval(autoPlayInterval);
            autoPlayInterval = null;
            playBtn.textContent = "Auto Play";
        }
        return;
    }

    nodesReceivedFileThisRound.clear(); // Clear the set for this round
    updateNodeStyles(); // Update styles for the current round

    // Get all nodes that can pass the file
    nodesReadyToPass = new Set([...nodesHasFile].filter(id => !nodesReceivedFileThisRound.has(id)));
    if (nodesReadyToPass.size === 0) {
        messageEl.textContent = "No nodes are ready to pass the file.";
        nextBtn.disabled = true;
        return;
    }

    // Get all nodes that can receive the file
    const nodesToPass = determineNodesThatCanPassTo();

    if (nodesToPass.size === 0) {
        messageEl.textContent = "No more files can be passed with current rules.";
        nextBtn.disabled = true;
        return;
    }

    // Pass the file from nodesReadyToPass to nodesToPass
    const animationsQueue = [];
    let filesPassed = false;
    nodesReadyToPass.forEach(nodeId => {
        const node = findNodeById(rootNode, nodeId);
        if (node) {
            // Check if the node has children that can receive the file
            node.children.forEach(child => {
                if (nodesToPass.has(child.id) && !nodesHasFile.has(child.id)) {
                    animationsQueue.push({ from: nodeId, to: child.id });
                    filesPassed = true;
                }
            });
        }
    });

    // Clear the ready to pass set for next iteration
    nodesReadyToPass.clear();

    // If no files were passed, we're done
    if (!filesPassed && nodesHasFile.size < allNodes.length) {
        messageEl.textContent =
            "No eligible sender could pass the file under the current strategy.";
        nextBtn.disabled = true;
        return;
    }

    await runAnimationsQueue(animationsQueue);
    nodesToPass.forEach(id => nodesHasFile.add(id));

    // Check if all nodes have received the file
    if (nodesHasFile.size >= allNodesCount) {
        messageEl.textContent = "All nodes have received the file!";
        nextBtn.disabled = true;
        if (autoPlayInterval) {
            clearInterval(autoPlayInterval);
            autoPlayInterval = null;
            playBtn.textContent = "Auto Play";
        }
    } else {
        messageEl.textContent = `${nodesHasFile.size} nodes have the file. ${allNodesCount - nodesHasFile.size} nodes remaining.`;
    }
}

function moveFile(sourceId, targetId, callback) {
    const src = nodeElements[sourceId];
    const dst = nodeElements[targetId];

    const sourceX = src.offsetLeft + 20;
    const sourceY = src.offsetTop + 17.5;
    const targetX = dst.offsetLeft + 20;
    const targetY = dst.offsetTop + 17.5;

    const animFile = document.createElement('div');
    animFile.className = 'file';
    animFile.style.left = `${sourceX}px`;
    animFile.style.top = `${sourceY}px`;
    container.appendChild(animFile);

    fileAnimating = true;
    setTimeout(() => {
        animFile.style.left = `${targetX}px`;
        animFile.style.top = `${targetY}px`;
    }, 50);

    setTimeout(() => {
        container.removeChild(animFile);
        nodesReceivedFileThisRound.add(targetId);
        nodesReceivedFileThisRound.delete(sourceId);
        updateNodeStyles();
        fileAnimating = false;
        callback && callback();
    }, 550);
}


// Run animations in sequence
function runAnimationsQueue(queue) {
    return new Promise(resolve => {
        const step = i =>
            i >= queue.length
                ? resolve()
                : moveFile(queue[i].from, queue[i].to, () => step(i + 1));
        step(0);
    });
}

// Update the message based on current state
function updateMessage() {
    const remainingNodes = allNodes.length - nodesHasFile.size;
    if (remainingNodes === 0) {
        messageEl.textContent = "All nodes have received the file!";
        nextBtn.disabled = true;
        if (autoPlayInterval) {
            clearInterval(autoPlayInterval);
            autoPlayInterval = null;
            playBtn.textContent = "Auto Play";
        }
    } else {
        messageEl.textContent = `${nodesHasFile.size} nodes have the file. ${remainingNodes} nodes remaining.`;
    }
}

// Find a node by its ID
function findNodeById(root, id) {
    if (root.id === id) return root;

    for (const child of root.children) {
        const found = findNodeById(child, id);
        if (found) return found;
    }

    return null;
}

/*╔════════════════════════════════════════════════════════════╗
  ┃  7.  UI EVENT LISTENERS & HELPERS                          ┃
  ╚════════════════════════════════════════════════════════════╝*/
function deleteNodeById(node, idToDelete) {
    if (!node.children) return;
    node.children = node.children.filter(child => child.id !== idToDelete);
    node.children.forEach(child => deleteNodeById(child, idToDelete));
    nodesHasFile.delete(idToDelete);
    nodesReadyToPass.delete(idToDelete);
    nodesReceivedFileThisRound.delete(idToDelete);
}
function deleteNode() {
    if (!selectedNode || selectedNode.id === 0) {
        alert('Cannot delete the root node!');
        return;
    }
    deleteNodeById(rootNode, selectedNode.id);
    selectedNode = null;
    renderTree(); // Only re-render the tree
}
function addChild() {
    if (!selectedNode) {
        alert('Select a node first!');
        return;
    }
    const newId = nodeIdCounter++;
    selectedNode.children.push({ id: newId, label: `${newId}`, children: [] });
    renderTree();
}

addChildBtn.addEventListener('click', addChild);
deleteBtn.addEventListener('click', deleteNode);
resetBtn.addEventListener('click', () => {
    nodeIdCounter = NODE_ID_START;
    rootNode = {id: 0, label: 'Root', children: []};
    selectedNode = null; // Deselect any selected node
    Object.values(nodeElements).forEach(el => el.classList.remove('selected'));
    nodesHasFile.clear();
    nodesReadyToPass.clear();
    nodesReceivedFileThisRound.clear();
    initializeVisualization();
});
});
clearBtn.addEventListener('click', initializeVisualization);
nextBtn.addEventListener('click', () => { selectedNode = null; nextStep(); });
playBtn.addEventListener('click', () => {
    selectedNode = null; // Deselect any selected node
    Object.values(nodeElements).forEach(el => el.classList.remove('selected'));
    if (fileAnimating) return; // Prevent auto-play during animation
    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
        playBtn.textContent = "Auto Play";
    } else {
        autoPlayInterval = setInterval(() => {
            if (nextBtn.disabled) {
                clearInterval(autoPlayInterval);
                autoPlayInterval = null;
                playBtn.textContent = "Auto Play";
                return;
            }
            nextStep();
        }, 1000);
        playBtn.textContent = "Stop";
    }
});

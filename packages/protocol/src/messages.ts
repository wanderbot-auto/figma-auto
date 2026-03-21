export const PROTOCOL_VERSION = "1.0.0";
export const BRIDGE_PORT = 4318;
export const SESSION_REPLACED_CLOSE_CODE = 4001;
export const SESSION_REPLACED_CLOSE_REASON = "session_replaced";
export const MAX_BATCH_OPS = 10;
export const MAX_BATCH_V2_OPS = 25;
export const MAX_FIND_RESULTS = 200;
export const MAX_NORMALIZE_NAME_RESULTS = 500;

export const ERROR_CODES = [
  "missing_session",
  "validation_failed",
  "node_not_found",
  "node_type_mismatch",
  "font_load_failed",
  "permission_denied",
  "batch_limit_exceeded",
  "internal_error"
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
export type EditorType = "figma";
export type VariableResolvedDataType = "BOOLEAN" | "COLOR" | "FLOAT" | "STRING";
export type CodeSyntaxPlatform = "WEB" | "ANDROID" | "iOS";
export type ToolName =
  | "figma.get_session_status"
  | "figma.ping"
  | "figma.get_file"
  | "figma.get_current_page"
  | "figma.get_flow"
  | "figma.get_selection"
  | "figma.list_pages"
  | "figma.get_node"
  | "figma.get_node_tree"
  | "figma.find_nodes"
  | "figma.get_styles"
  | "figma.get_components"
  | "figma.get_variables"
  | "figma.rename_node"
  | "figma.create_page"
  | "figma.create_frame"
  | "figma.create_rectangle"
  | "figma.create_component"
  | "figma.create_instance"
  | "figma.create_text"
  | "figma.duplicate_node"
  | "figma.set_instance_properties"
  | "figma.set_image_fill"
  | "figma.set_reactions"
  | "figma.set_text"
  | "figma.apply_styles"
  | "figma.update_node_properties"
  | "figma.move_node"
  | "figma.delete_node"
  | "figma.batch_edit"
  | "figma.batch_edit_v2"
  | "figma.create_variable_collection"
  | "figma.create_variable"
  | "figma.bind_variable"
  | "figma.normalize_names"
  | "figma.create_spec_page"
  | "figma.extract_design_tokens";
export type BridgeMessageType = ToolName | "session.register";
export type BatchOperationType =
  | "rename_node"
  | "create_page"
  | "create_frame"
  | "create_rectangle"
  | "create_instance"
  | "create_text"
  | "duplicate_node"
  | "set_instance_properties"
  | "set_image_fill"
  | "set_text"
  | "update_node_properties"
  | "move_node"
  | "delete_node"
  | "bind_variable";

export interface ProtocolError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown> | undefined;
}

export interface RequestEnvelope<TType extends string = string, TPayload = unknown> {
  protocolVersion: string;
  type: TType;
  requestId: string;
  sessionId: string;
  payload: TPayload;
}

export interface SuccessResponseEnvelope<TResult = unknown> {
  protocolVersion: string;
  requestId: string;
  ok: true;
  result: TResult;
}

export interface ErrorResponseEnvelope {
  protocolVersion: string;
  requestId: string;
  ok: false;
  error: ProtocolError;
}

export type ResponseEnvelope<TResult = unknown> =
  | SuccessResponseEnvelope<TResult>
  | ErrorResponseEnvelope;

export interface SessionRegistrationPayload {
  sessionId: string;
  protocolVersion: string;
  pluginInstanceId: string;
  fileKey: string | null;
  pageId: string;
  editorType: EditorType;
}

export interface NodeSummary {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
}

export interface AppliedStyleRefs {
  fillStyleId?: string | null | undefined;
  strokeStyleId?: string | null | undefined;
  effectStyleId?: string | null | undefined;
  textStyleId?: string | null | undefined;
  gridStyleId?: string | null | undefined;
}

export interface BoundVariableRef {
  kind: "node_field" | "text_field" | "paint" | "effect" | "grid" | "component_property";
  field: string;
  variableId: string;
  paintIndex?: number | undefined;
}

export interface ComponentPropertyValueSummary {
  type: string;
  value: string | boolean;
}

export interface InstanceMetadata {
  nodeKind: "COMPONENT" | "COMPONENT_SET" | "INSTANCE" | "OTHER";
  mainComponentId?: string | null | undefined;
  componentSetId?: string | null | undefined;
  componentProperties?: Record<string, ComponentPropertyValueSummary> | undefined;
}

export interface NodeDesignMetadata {
  styles?: AppliedStyleRefs | undefined;
  boundVariables?: BoundVariableRef[] | undefined;
  instance?: InstanceMetadata | undefined;
}

export interface VectorValue {
  x: number;
  y: number;
}

export type PrototypeEasingType =
  | "EASE_IN"
  | "EASE_OUT"
  | "EASE_IN_AND_OUT"
  | "LINEAR"
  | "EASE_IN_BACK"
  | "EASE_OUT_BACK"
  | "EASE_IN_AND_OUT_BACK"
  | "CUSTOM_CUBIC_BEZIER"
  | "GENTLE"
  | "QUICK"
  | "BOUNCY"
  | "SLOW"
  | "CUSTOM_SPRING";

export interface PrototypeEasingFunctionBezier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PrototypeEasingFunctionSpring {
  mass: number;
  stiffness: number;
  damping: number;
  initialVelocity: number;
}

export interface PrototypeEasing {
  type: PrototypeEasingType;
  easingFunctionCubicBezier?: PrototypeEasingFunctionBezier | undefined;
  easingFunctionSpring?: PrototypeEasingFunctionSpring | undefined;
}

export interface PrototypeSimpleTransition {
  type: "DISSOLVE" | "SMART_ANIMATE" | "SCROLL_ANIMATE";
  easing: PrototypeEasing;
  duration: number;
}

export interface PrototypeDirectionalTransition {
  type: "MOVE_IN" | "MOVE_OUT" | "PUSH" | "SLIDE_IN" | "SLIDE_OUT";
  direction: "LEFT" | "RIGHT" | "TOP" | "BOTTOM";
  matchLayers: boolean;
  easing: PrototypeEasing;
  duration: number;
}

export type PrototypeTransition = PrototypeSimpleTransition | PrototypeDirectionalTransition;

export type PrototypeTrigger =
  | {
      type: "ON_CLICK" | "ON_HOVER" | "ON_PRESS" | "ON_DRAG";
    }
  | {
      type: "AFTER_TIMEOUT";
      timeout: number;
    }
  | {
      type: "MOUSE_UP" | "MOUSE_DOWN";
      delay: number;
    }
  | {
      type: "MOUSE_ENTER" | "MOUSE_LEAVE";
      delay: number;
      deprecatedVersion: boolean;
    }
  | {
      type: "ON_KEY_DOWN";
      device: "KEYBOARD" | "XBOX_ONE" | "PS4" | "SWITCH_PRO" | "UNKNOWN_CONTROLLER";
      keyCodes: number[];
    }
  | {
      type: "ON_MEDIA_HIT";
      mediaHitTime: number;
    }
  | {
      type: "ON_MEDIA_END";
    };

export type PrototypeVariableDataType = "BOOLEAN" | "FLOAT" | "STRING" | "VARIABLE_ALIAS" | "COLOR" | "EXPRESSION";

export type PrototypeExpressionFunction =
  | "ADDITION"
  | "SUBTRACTION"
  | "MULTIPLICATION"
  | "DIVISION"
  | "EQUALS"
  | "NOT_EQUAL"
  | "LESS_THAN"
  | "LESS_THAN_OR_EQUAL"
  | "GREATER_THAN"
  | "GREATER_THAN_OR_EQUAL"
  | "AND"
  | "OR"
  | "VAR_MODE_LOOKUP"
  | "NEGATE"
  | "NOT";

export interface PrototypeExpression {
  expressionFunction: PrototypeExpressionFunction;
  expressionArguments: PrototypeVariableData[];
}

export type PrototypeVariableValueWithExpression =
  | boolean
  | number
  | string
  | ColorValue
  | VariableAliasValue
  | PrototypeExpression;

export interface PrototypeVariableData {
  type?: PrototypeVariableDataType | undefined;
  resolvedType?: VariableResolvedDataType | undefined;
  value?: PrototypeVariableValueWithExpression | undefined;
}

export interface PrototypeConditionalBlock {
  condition?: PrototypeVariableData | undefined;
  actions: PrototypeAction[];
}

export type PrototypeNavigation = "NAVIGATE" | "SWAP" | "OVERLAY" | "SCROLL_TO" | "CHANGE_TO";

export type PrototypeAction =
  | {
      type: "BACK" | "CLOSE";
    }
  | {
      type: "URL";
      url: string;
      openInNewTab?: boolean | undefined;
    }
  | {
      type: "UPDATE_MEDIA_RUNTIME";
      destinationId?: string | null | undefined;
      mediaAction:
        | "PLAY"
        | "PAUSE"
        | "TOGGLE_PLAY_PAUSE"
        | "MUTE"
        | "UNMUTE"
        | "TOGGLE_MUTE_UNMUTE"
        | "SKIP_FORWARD"
        | "SKIP_BACKWARD"
        | "SKIP_TO";
      amountToSkip?: number | undefined;
      newTimestamp?: number | undefined;
    }
  | {
      type: "SET_VARIABLE";
      variableId: string | null;
      variableValue?: PrototypeVariableData | undefined;
    }
  | {
      type: "SET_VARIABLE_MODE";
      variableCollectionId: string | null;
      variableModeId: string | null;
    }
  | {
      type: "CONDITIONAL";
      conditionalBlocks: PrototypeConditionalBlock[];
    }
  | {
      type: "NODE";
      destinationId: string | null;
      navigation: PrototypeNavigation;
      transition?: PrototypeTransition | null | undefined;
      preserveScrollPosition?: boolean | undefined;
      overlayRelativePosition?: VectorValue | undefined;
      resetVideoPosition?: boolean | undefined;
      resetScrollPosition?: boolean | undefined;
      resetInteractiveComponents?: boolean | undefined;
    };

export interface PrototypeReaction {
  action?: PrototypeAction | undefined;
  actions?: PrototypeAction[] | undefined;
  trigger: PrototypeTrigger | null;
}

export type OverflowDirection = "NONE" | "HORIZONTAL" | "VERTICAL" | "BOTH";

export interface NodePrototypeMetadata {
  reactions?: PrototypeReaction[] | undefined;
  overflowDirection?: OverflowDirection | undefined;
}

export interface NodeDetails extends NodeSummary {
  childIds?: string[] | undefined;
  characters?: string | undefined;
  cornerRadius?: number | undefined;
  fills?: SerializablePaint[] | undefined;
  height?: number | undefined;
  itemSpacing?: number | undefined;
  locked?: boolean | undefined;
  opacity?: number | undefined;
  paddingBottom?: number | undefined;
  paddingLeft?: number | undefined;
  paddingRight?: number | undefined;
  paddingTop?: number | undefined;
  rotation?: number | undefined;
  strokeWeight?: number | undefined;
  strokes?: SerializablePaint[] | undefined;
  textAlignHorizontal?: TextAlignHorizontal | undefined;
  textAlignVertical?: TextAlignVertical | undefined;
  fontSize?: number | undefined;
  fontFamily?: string | undefined;
  fontStyle?: string | undefined;
  lineHeight?: LineHeightValue | undefined;
  letterSpacing?: LetterSpacingValue | undefined;
  paragraphSpacing?: number | undefined;
  paragraphIndent?: number | undefined;
  textCase?: TextCase | undefined;
  textDecoration?: TextDecoration | undefined;
  visible?: boolean | undefined;
  width?: number | undefined;
  x?: number | undefined;
  y?: number | undefined;
  layoutMode?: AutoLayoutMode | undefined;
  primaryAxisAlignItems?: AutoLayoutPrimaryAxisAlignItems | undefined;
  counterAxisAlignItems?: AutoLayoutCounterAxisAlignItems | undefined;
  primaryAxisSizingMode?: AutoLayoutSizingMode | undefined;
  counterAxisSizingMode?: AutoLayoutSizingMode | undefined;
  layoutGrow?: number | undefined;
  layoutAlign?: AutoLayoutChildAlign | undefined;
  clipsContent?: boolean | undefined;
  design?: NodeDesignMetadata | undefined;
  prototype?: NodePrototypeMetadata | undefined;
}

export interface NodeTreeNode extends NodeDetails {
  children?: NodeTreeNode[] | undefined;
}

export interface PageSummary {
  id: string;
  name: string;
}

export interface FileSummary {
  fileKey: string | null;
  name: string;
  currentPageId: string;
  pages: PageSummary[];
}

export interface PingResult {
  bridgeTime: string;
  pluginInstanceId: string;
  sessionId: string;
}

export interface SessionStatus {
  sessionId: string;
  pluginInstanceId: string;
  fileKey: string | null;
  pageId: string;
  editorType: EditorType;
  connectedAt: string;
  lastSeenAt: string;
}

export interface GetSessionStatusResult {
  connected: boolean;
  host: string;
  port: number;
  publicWsUrl: string;
  publicHttpUrl: string;
  session: SessionStatus | null;
}

export interface GetFileResult {
  file: FileSummary;
}

export interface GetCurrentPageResult {
  page: PageSummary;
  selection: NodeSummary[];
  childIds: string[];
}

export interface FlowStartingPointSummary {
  nodeId: string;
  name: string;
}

export interface PageFlowSummary {
  page: PageSummary;
  flowStartingPoints: FlowStartingPointSummary[];
  prototypeStartNode: NodeSummary | null;
  prototypeBackgrounds: SerializablePaint[];
}

export interface GetSelectionResult {
  fileKey: string | null;
  pageId: string;
  selection: NodeSummary[];
}

export interface GetFlowPayload {
  pageId?: string | undefined;
}

export interface GetFlowResult {
  flow: PageFlowSummary;
}

export interface ListPagesResult {
  fileKey: string | null;
  currentPageId: string;
  pages: PageSummary[];
}

export interface GetNodePayload {
  nodeId: string;
}

export interface GetNodeResult {
  node: NodeDetails;
}

export interface GetNodeTreePayload {
  nodeId?: string | undefined;
  depth?: number | undefined;
}

export interface GetNodeTreeResult {
  root: NodeTreeNode;
  requestedDepth?: number | undefined;
}

export interface FindNodesPayload {
  nodeId?: string | undefined;
  depth?: number | undefined;
  nameContains?: string | undefined;
  nameExact?: string | undefined;
  textContains?: string | undefined;
  type?: string | undefined;
  includeHidden?: boolean | undefined;
  visible?: boolean | undefined;
  locked?: boolean | undefined;
  styleId?: string | undefined;
  variableId?: string | undefined;
  componentId?: string | undefined;
  instanceOnly?: boolean | undefined;
  limit?: number | undefined;
}

export interface FindNodeMatch extends NodeSummary {
  matchedBy?: string[] | undefined;
}

export interface FindNodesResult {
  root: NodeSummary;
  matches: FindNodeMatch[];
  totalMatches: number;
  truncated: boolean;
}

export interface VariableAliasValue {
  type: "VARIABLE_ALIAS";
  id: string;
}

export interface ColorValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface SerializableSolidPaint {
  type: "SOLID";
  color: ColorValue;
  opacity?: number | undefined;
  visible?: boolean | undefined;
}

export type ImageScaleMode = "FILL" | "FIT" | "CROP" | "TILE";

export type TransformMatrix = [[number, number, number], [number, number, number]];

export interface SerializableImagePaint {
  type: "IMAGE";
  imageHash?: string | null | undefined;
  src?: string | undefined;
  scaleMode: ImageScaleMode;
  imageTransform?: TransformMatrix | undefined;
  scalingFactor?: number | undefined;
  rotation?: number | undefined;
  opacity?: number | undefined;
  visible?: boolean | undefined;
}

export type SerializablePaint = SerializableSolidPaint | SerializableImagePaint;

export type AutoLayoutMode = "NONE" | "HORIZONTAL" | "VERTICAL";
export type AutoLayoutSizingMode = "FIXED" | "AUTO";
export type AutoLayoutPrimaryAxisAlignItems = "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN";
export type AutoLayoutCounterAxisAlignItems = "MIN" | "MAX" | "CENTER" | "BASELINE";
export type AutoLayoutChildAlign = "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT";
export type TextAlignHorizontal = "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
export type TextAlignVertical = "TOP" | "CENTER" | "BOTTOM";
export type TextCase = "ORIGINAL" | "UPPER" | "LOWER" | "TITLE" | "SMALL_CAPS" | "SMALL_CAPS_FORCED";
export type TextDecoration = "NONE" | "UNDERLINE" | "STRIKETHROUGH";

export interface LineHeightValue {
  unit: "PIXELS" | "PERCENT" | "AUTO";
  value?: number | undefined;
}

export interface LetterSpacingValue {
  unit: "PIXELS" | "PERCENT";
  value: number;
}

export type VariableModeValue = boolean | number | string | ColorValue | VariableAliasValue;

export interface VariableCollectionModeSummary {
  modeId: string;
  name: string;
}

export interface VariableCollectionSummary {
  id: string;
  name: string;
  hiddenFromPublishing: boolean;
  remote: boolean;
  isExtension: boolean;
  defaultModeId: string;
  key: string;
  modes: VariableCollectionModeSummary[];
  variableIds: string[];
}

export interface VariableSummary {
  id: string;
  name: string;
  description: string;
  hiddenFromPublishing: boolean;
  remote: boolean;
  variableCollectionId: string;
  key: string;
  resolvedType: VariableResolvedDataType;
  scopes: string[];
  codeSyntax: Partial<Record<CodeSyntaxPlatform, string | undefined>>;
  valuesByMode?: Record<string, VariableModeValue> | undefined;
}

export interface GetVariablesPayload {
  collectionId?: string | undefined;
  resolvedType?: VariableResolvedDataType | undefined;
  includeValues?: boolean | undefined;
}

export interface GetVariablesResult {
  collections: VariableCollectionSummary[];
  variables: VariableSummary[];
  totalVariables: number;
}

export type StyleType = "PAINT" | "TEXT" | "EFFECT" | "GRID";

export interface StyleSummary {
  id: string;
  key: string;
  name: string;
  type: StyleType;
  description?: string | undefined;
  value?: Record<string, unknown> | undefined;
  boundVariables?: Record<string, unknown> | undefined;
}

export interface GetStylesPayload {
  types?: StyleType[] | undefined;
  nameContains?: string | undefined;
  limit?: number | undefined;
  includeDetails?: boolean | undefined;
}

export interface GetStylesResult {
  styles: StyleSummary[];
  totalStyles: number;
  truncated: boolean;
}

export interface ComponentPropertyDefinitionSummary {
  type: string;
  defaultValue?: string | boolean | Record<string, unknown> | undefined;
  variantOptions?: string[] | undefined;
  preferredValues?: Array<Record<string, unknown>> | undefined;
}

export type ComponentPropertyOverrideValue = string | boolean | VariableAliasValue;

export interface ComponentSummary {
  id: string;
  name: string;
  type: "COMPONENT" | "COMPONENT_SET";
  componentSetId?: string | null | undefined;
  propertyDefinitions?: Record<string, ComponentPropertyDefinitionSummary> | undefined;
  variantChildren?: Array<{ id: string; name: string }> | undefined;
}

export interface GetComponentsPayload {
  nameContains?: string | undefined;
  limit?: number | undefined;
  includeProperties?: boolean | undefined;
}

export interface GetComponentsResult {
  components: ComponentSummary[];
  totalComponents: number;
  truncated: boolean;
}

export interface RenameNodePayload {
  nodeId: string;
  name: string;
}

export interface RenameNodeResult {
  node: NodeSummary;
}

export interface CreatePagePayload {
  name: string;
}

export interface CreatePageResult {
  page: PageSummary;
}

export interface CreateFramePayload {
  parentId?: string | undefined;
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export interface CreateFrameResult {
  node: NodeDetails;
}

export interface CreateRectanglePayload {
  parentId?: string | undefined;
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  cornerRadius?: number | undefined;
}

export interface CreateRectangleResult {
  node: NodeDetails;
}

export interface CreateComponentPayload {
  nodeId?: string | undefined;
  parentId?: string | undefined;
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export interface CreateComponentResult {
  node: NodeDetails;
  sourceNodeId?: string | undefined;
}

export interface CreateInstancePayload {
  componentId: string;
  parentId?: string | undefined;
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  index?: number | undefined;
}

export interface CreateInstanceResult {
  node: NodeDetails;
  sourceComponentId: string;
}

export interface CreateTextPayload {
  parentId?: string | undefined;
  name?: string | undefined;
  text?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
}

export interface CreateTextResult {
  node: NodeDetails;
  text: string;
}

export interface DuplicateNodePayload {
  nodeId: string;
  parentId?: string | undefined;
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  index?: number | undefined;
}

export interface DuplicateNodeResult {
  node: NodeDetails;
  sourceNodeId: string;
}

export interface SetTextPayload {
  nodeId: string;
  text: string;
}

export interface SetTextResult {
  node: NodeSummary;
  text: string;
}

export interface SetInstancePropertiesPayload {
  nodeId: string;
  variantProperties?: Record<string, string> | undefined;
  componentProperties?: Record<string, ComponentPropertyOverrideValue> | undefined;
  swapComponentId?: string | undefined;
  preserveOverrides?: boolean | undefined;
}

export interface SetInstancePropertiesResult {
  node: NodeDetails;
  updatedFields: string[];
  sourceComponentId: string | null;
}

export interface SetImageFillPayload {
  nodeId: string;
  image: SerializableImagePaint;
  paintIndex?: number | undefined;
  preserveOtherFills?: boolean | undefined;
}

export interface SetImageFillResult {
  node: NodeDetails;
  imageHash: string;
  paintIndex: number;
  updatedFields: string[];
}

export interface SetReactionsPayload {
  nodeId: string;
  reactions: PrototypeReaction[];
}

export interface SetReactionsResult {
  node: NodeDetails;
  reactionCount: number;
}

export interface ApplyStylesPayload {
  nodeId: string;
  styles: {
    fillStyleId?: string | null | undefined;
    strokeStyleId?: string | null | undefined;
    effectStyleId?: string | null | undefined;
    textStyleId?: string | null | undefined;
    gridStyleId?: string | null | undefined;
  };
}

export interface ApplyStylesResult {
  node: NodeDetails;
  appliedFields: string[];
}

export interface LayoutPropertiesPatch {
  mode?: AutoLayoutMode | undefined;
  itemSpacing?: number | undefined;
  paddingTop?: number | undefined;
  paddingRight?: number | undefined;
  paddingBottom?: number | undefined;
  paddingLeft?: number | undefined;
  primaryAxisAlignItems?: AutoLayoutPrimaryAxisAlignItems | undefined;
  counterAxisAlignItems?: AutoLayoutCounterAxisAlignItems | undefined;
  primaryAxisSizingMode?: AutoLayoutSizingMode | undefined;
  counterAxisSizingMode?: AutoLayoutSizingMode | undefined;
}

export interface TextPropertiesPatch {
  fontSize?: number | undefined;
  fontFamily?: string | undefined;
  fontStyle?: string | undefined;
  lineHeight?: LineHeightValue | undefined;
  letterSpacing?: LetterSpacingValue | undefined;
  paragraphSpacing?: number | undefined;
  paragraphIndent?: number | undefined;
  textCase?: TextCase | undefined;
  textDecoration?: TextDecoration | undefined;
  textAlignHorizontal?: TextAlignHorizontal | undefined;
  textAlignVertical?: TextAlignVertical | undefined;
}

export interface NodePropertiesPatch {
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  rotation?: number | undefined;
  visible?: boolean | undefined;
  locked?: boolean | undefined;
  opacity?: number | undefined;
  cornerRadius?: number | undefined;
  fills?: SerializablePaint[] | undefined;
  strokes?: SerializablePaint[] | undefined;
  strokeWeight?: number | undefined;
  clipsContent?: boolean | undefined;
  layoutGrow?: number | undefined;
  layoutAlign?: AutoLayoutChildAlign | undefined;
  layout?: LayoutPropertiesPatch | undefined;
  text?: TextPropertiesPatch | undefined;
}

export interface UpdateNodePropertiesPayload {
  nodeId: string;
  properties: NodePropertiesPatch;
}

export interface UpdateNodePropertiesResult {
  node: NodeDetails;
  updatedFields: string[];
}

export interface MoveNodePayload {
  nodeId: string;
  parentId: string;
  index?: number | undefined;
}

export interface MoveNodeResult {
  node: NodeDetails;
  parentId: string;
  index: number;
}

export interface DeleteNodePayload {
  nodeId: string;
  confirm: boolean;
}

export interface DeleteNodeResult {
  deletedNodeId: string;
  parentId: string | null;
  name: string;
}

export interface CreateVariableCollectionPayload {
  name: string;
  modes?: string[] | undefined;
  hiddenFromPublishing?: boolean | undefined;
}

export interface CreateVariableCollectionResult {
  collection: VariableCollectionSummary;
}

export interface CreateVariablePayload {
  collectionId: string;
  name: string;
  resolvedType: VariableResolvedDataType;
  description?: string | undefined;
  hiddenFromPublishing?: boolean | undefined;
  scopes?: string[] | undefined;
  codeSyntax?: Partial<Record<CodeSyntaxPlatform, string | undefined>> | undefined;
  valuesByMode?: Record<string, VariableModeValue> | undefined;
}

export interface CreateVariableResult {
  variable: VariableSummary;
}

export type BindVariableKind = "node_field" | "text_field" | "paint";

export interface BindVariablePayload {
  nodeId: string;
  variableId?: string | null | undefined;
  kind: BindVariableKind;
  field: string;
  paintIndex?: number | undefined;
}

export interface BindVariableResult {
  node: NodeSummary;
  variableId: string | null;
  kind: BindVariableKind;
  field: string;
  paintIndex?: number | undefined;
}

export type NormalizeNameCaseStyle = "none" | "title" | "upper" | "lower";

export interface NormalizeNamesPayload {
  nodeId?: string | undefined;
  depth?: number | undefined;
  includeHidden?: boolean | undefined;
  caseStyle?: NormalizeNameCaseStyle | undefined;
  dryRun?: boolean | undefined;
  confirm?: boolean | undefined;
  limit?: number | undefined;
}

export interface NormalizeNameItemResult {
  nodeId: string;
  beforeName: string;
  afterName: string;
  wouldChange: boolean;
}

export interface NormalizeNamesResult {
  dryRun: boolean;
  root: NodeSummary;
  renamedCount: number;
  truncated: boolean;
  results: NormalizeNameItemResult[];
}

export interface CreateSpecPagePayload {
  name?: string | undefined;
  sourceNodeId?: string | undefined;
  includeVariables?: boolean | undefined;
  includeTokens?: boolean | undefined;
  includeSelection?: boolean | undefined;
}

export interface CreateSpecPageResult {
  page: PageSummary;
  contentNodeId: string;
  sourceSummary?: NodeSummary | undefined;
}

export interface StyleTokenSummary {
  id: string;
  name: string;
  type: "PAINT" | "TEXT" | "EFFECT" | "GRID";
  value: Record<string, unknown>;
  boundVariables?: Record<string, unknown> | undefined;
}

export interface ExtractDesignTokensPayload {
  collectionId?: string | undefined;
  includeVariables?: boolean | undefined;
  includeStyles?: boolean | undefined;
}

export interface ExtractDesignTokensResult {
  summary: string;
  collections: VariableCollectionSummary[];
  variables: VariableSummary[];
  styles: StyleTokenSummary[];
}

export interface BatchRenameNodeOperation {
  op: "rename_node";
  nodeId: string;
  name: string;
}

export interface BatchCreatePageOperation {
  op: "create_page";
  name: string;
}

export interface BatchCreateRectangleOperation extends CreateRectanglePayload {
  op: "create_rectangle";
}

export interface BatchSetTextOperation {
  op: "set_text";
  nodeId: string;
  text: string;
}

export interface BatchCreateFrameOperation extends CreateFramePayload {
  op: "create_frame";
}

export interface BatchCreateInstanceOperation extends CreateInstancePayload {
  op: "create_instance";
}

export interface BatchCreateTextOperation extends CreateTextPayload {
  op: "create_text";
}

export interface BatchDuplicateNodeOperation extends DuplicateNodePayload {
  op: "duplicate_node";
}

export interface BatchUpdateNodePropertiesOperation extends UpdateNodePropertiesPayload {
  op: "update_node_properties";
}

export interface BatchMoveNodeOperation extends MoveNodePayload {
  op: "move_node";
}

export interface BatchDeleteNodeOperation {
  op: "delete_node";
  nodeId: string;
}

export interface BatchBindVariableOperation extends BindVariablePayload {
  op: "bind_variable";
}

export type BatchOperation =
  | BatchRenameNodeOperation
  | BatchCreatePageOperation
  | BatchCreateFrameOperation
  | BatchCreateRectangleOperation
  | BatchCreateInstanceOperation
  | BatchCreateTextOperation
  | BatchDuplicateNodeOperation
  | BatchSetTextOperation
  | BatchUpdateNodePropertiesOperation
  | BatchMoveNodeOperation
  | BatchDeleteNodeOperation
  | BatchBindVariableOperation;

export type BatchResultField = "createdNodeId" | "updatedNodeId" | "deletedNodeId";

export interface BatchValueReference {
  fromOp: string;
  field?: BatchResultField | undefined;
}

export type BatchResolvableId = string | BatchValueReference;

export interface BatchEditPayload {
  dryRun?: boolean | undefined;
  confirm?: boolean | undefined;
  ops: BatchOperation[];
}

export interface BatchEditItemPreview {
  before?: Record<string, unknown> | undefined;
  after?: Record<string, unknown> | undefined;
}

export interface BatchEditItemResult {
  index: number;
  op: BatchOperationType;
  opId?: string | undefined;
  ok: boolean;
  wouldChange: boolean;
  createdNodeId?: string | undefined;
  deletedNodeId?: string | undefined;
  targetSummary?: string | undefined;
  preview?: BatchEditItemPreview | undefined;
  error?: ProtocolError | undefined;
  result?: Record<string, unknown> | undefined;
  updatedNodeId?: string | undefined;
}

export interface BatchEditResult {
  dryRun: boolean;
  summary: string;
  results: BatchEditItemResult[];
  stoppedAt?: number | undefined;
}

export interface BatchEditV2OperationBase {
  opId?: string | undefined;
}

export interface BatchV2RenameNodeOperation extends BatchEditV2OperationBase {
  op: "rename_node";
  nodeId: BatchResolvableId;
  name: string;
}

export interface BatchV2CreatePageOperation extends BatchEditV2OperationBase {
  op: "create_page";
  name: string;
}

export interface BatchV2CreateFrameOperation extends BatchEditV2OperationBase {
  op: "create_frame";
  parentId?: BatchResolvableId | undefined;
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export interface BatchV2CreateRectangleOperation extends BatchEditV2OperationBase {
  op: "create_rectangle";
  parentId?: BatchResolvableId | undefined;
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  cornerRadius?: number | undefined;
}

export interface BatchV2CreateInstanceOperation extends BatchEditV2OperationBase {
  op: "create_instance";
  componentId: BatchResolvableId;
  parentId?: BatchResolvableId | undefined;
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
  index?: number | undefined;
}

export interface BatchV2CreateTextOperation extends BatchEditV2OperationBase {
  op: "create_text";
  parentId?: BatchResolvableId | undefined;
  name?: string | undefined;
  text?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
}

export interface BatchV2DuplicateNodeOperation extends BatchEditV2OperationBase {
  op: "duplicate_node";
  nodeId: BatchResolvableId;
  parentId?: BatchResolvableId | undefined;
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  index?: number | undefined;
}

export interface BatchV2SetTextOperation extends BatchEditV2OperationBase {
  op: "set_text";
  nodeId: BatchResolvableId;
  text: string;
}

export interface BatchV2SetInstancePropertiesOperation extends BatchEditV2OperationBase {
  op: "set_instance_properties";
  nodeId: BatchResolvableId;
  variantProperties?: Record<string, string> | undefined;
  componentProperties?: Record<string, ComponentPropertyOverrideValue> | undefined;
  swapComponentId?: BatchResolvableId | undefined;
  preserveOverrides?: boolean | undefined;
}

export interface BatchV2SetImageFillOperation extends BatchEditV2OperationBase {
  op: "set_image_fill";
  nodeId: BatchResolvableId;
  image: SerializableImagePaint;
  paintIndex?: number | undefined;
  preserveOtherFills?: boolean | undefined;
}

export interface BatchV2UpdateNodePropertiesOperation extends BatchEditV2OperationBase {
  op: "update_node_properties";
  nodeId: BatchResolvableId;
  properties: NodePropertiesPatch;
}

export interface BatchV2MoveNodeOperation extends BatchEditV2OperationBase {
  op: "move_node";
  nodeId: BatchResolvableId;
  parentId: BatchResolvableId;
  index?: number | undefined;
}

export interface BatchV2DeleteNodeOperation extends BatchEditV2OperationBase {
  op: "delete_node";
  nodeId: BatchResolvableId;
}

export interface BatchV2BindVariableOperation extends BatchEditV2OperationBase {
  op: "bind_variable";
  nodeId: BatchResolvableId;
  variableId?: BatchResolvableId | null | undefined;
  kind: BindVariableKind;
  field: string;
  paintIndex?: number | undefined;
}

export type BatchEditV2Operation =
  | BatchV2RenameNodeOperation
  | BatchV2CreatePageOperation
  | BatchV2CreateFrameOperation
  | BatchV2CreateRectangleOperation
  | BatchV2CreateInstanceOperation
  | BatchV2CreateTextOperation
  | BatchV2DuplicateNodeOperation
  | BatchV2SetTextOperation
  | BatchV2SetInstancePropertiesOperation
  | BatchV2SetImageFillOperation
  | BatchV2UpdateNodePropertiesOperation
  | BatchV2MoveNodeOperation
  | BatchV2DeleteNodeOperation
  | BatchV2BindVariableOperation;

export interface BatchEditV2Payload {
  dryRun?: boolean | undefined;
  confirm?: boolean | undefined;
  ops: BatchEditV2Operation[];
}

export interface BatchEditV2Result {
  dryRun: boolean;
  summary: string;
  results: BatchEditItemResult[];
  stoppedAt?: number | undefined;
}

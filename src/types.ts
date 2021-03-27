type OptimizationOptions = {
    throttle?: number;
    onlyUpdateAtIdle?: boolean;

    // TODO: re-implement this option, removed excess code as it lost it's way.
    portalElementReuse?: boolean;
    releaseComponentInstances?: boolean;
};

type DeoptimizationOptions = {
    overzealousInvalidation?: boolean;
    itemsOutsideViewportCanChangeSize?: boolean;
};

type SizeCategoryReference = string; // used to make types more descriptive

type ReadaptState = {
    sizes: { [id: string]: number | SizeCategoryReference };
    sizeCategoryValues: { [SizeCategory: string]: number };

    optimizations: OptimizationOptions;
    deoptimizations: DeoptimizationOptions;

    viewHeight: number;
    scrollTop: number;

    flipRenderBit: (fast?: boolean) => void;
};

type ReadaptRenderPassState = {
    y: number;
    order: string[];
    isDataOnlyRender: boolean;
    dynamicSizeReadyForCalculation: number;
    dynamicSizeIDs: Set<string>;
    invalidatedIDs: Set<string>;
    invalidated?: boolean;
    renderBit?: number;

    previousRenderPassState?: ReadaptRenderPassState;
};

type ScrollPlaceholderProps = {
    style: Partial<CSSStyleDeclaration>;
    dataPlaceholderIndex: number;
    ref: (element: HTMLElement) => void;
};

type SizeOptions = {
    size?: number;
    sizeCategory: SizeCategoryReference | null;
};

type VirtualItemStaticData = SizeOptions & {
    id: string;
};

type ScrollPlaceholdersOptions = SizeOptions & {
    render: (
        propsToSpread: ScrollPlaceholderProps
    ) => React.ReactElement<HTMLElement>;
};

type ReadaptProps = {
    children: React.ReactChildren;

    optimizations?: OptimizationOptions;
    deoptimizations?: DeoptimizationOptions;

    // if all items can change size based on something, this will trigger a batched recalculation even if items are off screen.
    sizeInvalidationBit?: any;

    scrollPlaceholders: ScrollPlaceholdersOptions | null;

    scrollElementRef: HTMLElement | null;
};

type VirtualItemContext = {
    renderPassState?: { current: ReadaptRenderPassState };
    readaptState?: { current: ReadaptState };
};

type ReadaptItemProps = {
    y: number;
    style: Partial<CSSStyleDeclaration>;
    isDataOnlyRender: boolean;
    invalidateSize: () => void;
};

type VirtualItemProps = {
    readapt: ReadaptItemProps | null;
};
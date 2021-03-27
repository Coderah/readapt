// "Adapt. React. Readapt. Apt" - Michael Scott

import React, {
    useCallback,
    useMemo,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import throttle from 'lodash/throttle';

import { makeVirtualItem } from './makeVirtualItem';

export const ReadaptContext: React.Context<VirtualItemContext> = React.createContext<VirtualItemContext>(
    {}
);

const DEFAULT_OPTIMIATIONS = {};

export const MAX_DYNAMIC_CALCULATION_PER_BATCH = 5;
export const SIZE_CATEGORY_BEING_CALCULATED = -1;

function getSize(id: string, state: ReadaptState): number | null {
    const { sizes, sizeCategoryValues } = state;

    const size = sizes[id];

    if (typeof size === 'string') {
        // size was stored as a reference to a sizeCategory
        const categorySize = sizeCategoryValues[size];
        if (!categorySize || categorySize === SIZE_CATEGORY_BEING_CALCULATED)
            return null;

        return categorySize;
    }

    return size;
}

const Readapt = ({
    children,
    scrollElementRef,
    optimizations = {},
    deoptimizations = {},
    scrollPlaceholders,
    sizeInvalidationBit,
}: ReadaptProps) => {
    optimizations = { ...DEFAULT_OPTIMIATIONS, ...optimizations };
    const [renderBit, setRenderBit] = useState(0);

    let flipped = false;
    const flipRenderBit = useCallback(
        (fast = false) => {
            if (flipped) return;
            flipped = true;

            if (fast) {
                setRenderBit(Math.random());
            } else {
                requestAnimationFrame(() => setRenderBit(Math.random()));
            }
        },
        [renderBit]
    );

    // const [scrollTop, setScrollTop] = useState<number>(0);
    const state = useRef<ReadaptState>({
        sizes: {},
        sizeCategoryValues: {},
        optimizations,
        deoptimizations,

        viewHeight: 0,
        scrollTop: 0,

        flipRenderBit,
    });

    state.current.flipRenderBit = flipRenderBit;

    const renderPassState = useRef<ReadaptRenderPassState>({
        y: 0,
        order: [],
        invalidatedIDs: new self.Set(),
        dynamicSizeIDs: new self.Set(),
        dynamicSizeReadyForCalculation: 0,
        isDataOnlyRender: false,
    });

    renderPassState.current.previousRenderPassState = {
        ...renderPassState.current,
    };

    renderPassState.current.renderBit = renderBit;

    renderPassState.current.invalidatedIDs.forEach((id) => {
        if (renderPassState.current.order.indexOf(id) === -1) {
            renderPassState.current.invalidatedIDs.delete(id);
        }
    });

    useMemo(() => {
        renderPassState.current.order.forEach((id) =>
            renderPassState.current.invalidatedIDs.add(id)
        );
    }, [sizeInvalidationBit]);

    // reset renderPassState for upcoming render
    renderPassState.current.y = 0;
    renderPassState.current.order = [];
    renderPassState.current.dynamicSizeReadyForCalculation = 0;
    // invalidatedIDs are held onto until they are used by our layoutEffect
    renderPassState.current.dynamicSizeIDs.clear();
    renderPassState.current.invalidated = false;
    renderPassState.current.isDataOnlyRender = false;

    const containerRef = useRef<HTMLDivElement | null>(null);

    // global data only pass when children change (including initial)
    useMemo(() => {
        renderPassState.current.isDataOnlyRender = true;
        renderPassState.current.invalidated = true;
    }, [children]);

    let placeholderSize = scrollPlaceholders?.size;

    if (scrollPlaceholders?.sizeCategory) {
        placeholderSize =
            state.current.sizeCategoryValues[scrollPlaceholders.sizeCategory];
    }

    const [placeholderChildren, placeholderRefs] = useMemo(() => {
        if (scrollPlaceholders) {
            const { render: renderPlaceholder } = scrollPlaceholders;

            if (
                !placeholderSize ||
                placeholderSize === SIZE_CATEGORY_BEING_CALCULATED
            )
                return [[], []];

            const placeholders = [];
            const refs: HTMLElement[] = [];

            for (
                let y = 0;
                y < state.current.viewHeight + placeholderSize;
                y += placeholderSize
            ) {
                placeholders.push(
                    renderPlaceholder({
                        style: {
                            zIndex: '0',
                            position: 'absolute',
                            top: '0',
                            transform: 'translateY(-5000px)',
                            pointerEvents: 'none',
                            height: `${placeholderSize}px`,
                        },
                        ref: (element: HTMLElement) => refs.push(element),
                        dataPlaceholderIndex: y / placeholderSize,
                    })
                );
            }

            return [placeholders, refs];
        }

        return [[], []];
    }, [state.current.viewHeight, scrollPlaceholders, placeholderSize]);

    const updatePlaceholders = useCallback(() => {
        if (!scrollElementRef || !scrollPlaceholders || !placeholderSize)
            return;

        let y =
            scrollElementRef.scrollTop -
            (scrollElementRef.scrollTop % placeholderSize);

        placeholderRefs.forEach((placeholderElement) => {
            if (!placeholderElement) return false;
            placeholderElement.style.transform = `translateY(${y}px)`;

            // $FlowFixMe: flow doesn't understand the early return above APPARENTLY
            placeholderElement.style.height = `${placeholderSize}px`;

            if (placeholderSize && y + placeholderSize < renderPassState.current.y) {
                y += placeholderSize;
            }

            return false;
        });
    }, [placeholderRefs, scrollPlaceholders, placeholderSize]);

    useEffect(() => {
        let handleScroll = () => {
            if (!scrollElementRef) return;
            state.current.scrollTop = scrollElementRef.scrollTop;

            state.current.flipRenderBit(true);
        };

        // TODO reimplement idlecallback with polyfill
        // let idleCallback;
        // if (optimizations.onlyUpdateAtIdle) {
        //     const originalHandleScroll = handleScroll;
        //     handleScroll = () => {
        //         if (idleCallback) {
        //             cancelIdleCallback(idleCallback);
        //             idleCallback = null;
        //         }

        //         idleCallback = requestIdleCallback(originalHandleScroll);
        //     };
        // } else 
        if (optimizations.throttle) {
            handleScroll = throttle(handleScroll, optimizations.throttle, {
                leading: false,
                trailing: true,
            });
        }

        if (
            scrollPlaceholders &&
            (optimizations.onlyUpdateAtIdle || optimizations.throttle)
        ) {
            const originalHandleScroll = handleScroll;

            handleScroll = () => {
                updatePlaceholders();

                originalHandleScroll();
            };
        }

        if (scrollElementRef) {
            state.current.viewHeight = scrollElementRef.clientHeight;

            scrollElementRef.addEventListener('scroll', handleScroll);
        }
        return () => {
            if (scrollElementRef) {
                scrollElementRef.removeEventListener('scroll', handleScroll);

                // TODO reimplement idlecallback with polyfill
                // if (idleCallback) {
                //     cancelIdleCallback(idleCallback);
                //     idleCallback = null;
                // }
            }
        };
    }, [scrollElementRef, updatePlaceholders, scrollPlaceholders]);

    useLayoutEffect(() => {
        if (scrollElementRef) {
            state.current.viewHeight = scrollElementRef.clientHeight;
            updatePlaceholders();
        }

        if (containerRef.current) {
            // TODO improve logic to know when it should or should not update the size of the scrollable area
            // some data only renders can cause a 0 y, leave the correct size in place.
            if (renderPassState.current.y > 0) {
                containerRef.current.style.height = `${renderPassState.current.y}px`;
            }
        }

        if (renderPassState.current.dynamicSizeIDs.size) {
            requestAnimationFrame(() => {
                if (!containerRef.current) return;

                const calculatedSizeCategories = new self.Set();

                renderPassState.current.dynamicSizeIDs.forEach((id) => {
                    const size = state.current.sizes[id];
                    let sizeCategory;

                    if (typeof size === 'string') {
                        // handle sizeCategory
                        if (calculatedSizeCategories.has(size)) {
                            renderPassState.current.invalidatedIDs.delete(id);
                            return;
                        }

                        sizeCategory = size;
                    }

                    // $FlowFixMe: we have a !containerRef.current return above.. flow is wrong because we're in a foreach?!?!
                    const element = containerRef.current?.querySelector(
                        `[data-id="${id}"`
                    );

                    if (element) {
                        const calculatedHeight = element.clientHeight;
                        if (
                            calculatedHeight &&
                            calculatedHeight !== getSize(id, state.current)
                        ) {
                            if (sizeCategory) {
                                calculatedSizeCategories.add(sizeCategory);
                                state.current.sizeCategoryValues[
                                    sizeCategory
                                ] = calculatedHeight;
                            } else {
                                state.current.sizes[id] = calculatedHeight;
                            }
                            state.current.flipRenderBit();
                        }
                    }
                });
            });
        }

        if (
            renderPassState.current.invalidated === true ||
            renderPassState.current.invalidatedIDs.size
        ) {
            state.current.flipRenderBit();
        }
    });

    return (
        <div ref={containerRef}>
            <ReadaptContext.Provider
                value={{ readaptState: state, renderPassState }}
            >
                {placeholderChildren}
                {children}
            </ReadaptContext.Provider>
        </div>
    );
};

export default Readapt;
export { Readapt, makeVirtualItem };

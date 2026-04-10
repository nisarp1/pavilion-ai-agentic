
import React, { useEffect, useState } from 'react';
import { PolotnoContainer, SidePanelWrap, WorkspaceWrap } from 'polotno';
import { Toolbar } from 'polotno/toolbar/toolbar';
import { ZoomButtons } from 'polotno/toolbar/zoom-buttons';
import { SidePanel } from 'polotno/side-panel';
import { Workspace } from 'polotno/canvas/workspace';
import { createStore } from 'polotno/model/store';
import api from '../../services/api';
import { FaSpinner, FaTimes, FaSave } from 'react-icons/fa';

import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/icons/lib/css/blueprint-icons.css';

// Create a MobX store instance for Polotno (outside component to persist or re-create carefully)
const store = createStore({
    key: "YOUR_API_KEY", // Replace with actual key or use free tier limits
    showCredit: true, // Required for free version
});

const PosterEditor = ({ articleId, onClose, onSaveSuccess }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState(null);

    // Initial Load
    useEffect(() => {
        loadPosterConfig();
    }, [articleId]);

    const loadPosterConfig = async () => {
        try {
            setLoading(true);
            const res = await api.get(`cms/articles/${articleId}/poster_editor_config/`);
            const data = res.data;
            setConfig(data);

            // Initialize Page
            store.addPage();
            store.setSize(1080, 1350);

            // 1. Add Background
            if (data.template.background_url) {
                await store.activePage.addElement({
                    type: 'image',
                    src: data.template.background_url,
                    x: 0,
                    y: 0,
                    width: 1080,
                    height: 1350,
                    locked: true, // Lock background
                    selectable: false
                });
            }

            // 2. Add Cutout (Player)
            if (data.assets.cutout_url) {
                const imgConfig = data.template.image_config?.image_fields?.find(f => f.name === 'featured_image');
                // Center roughly if no config
                const x = imgConfig?.x || 100;
                const y = imgConfig?.y || 400;
                const width = imgConfig?.width || 800; // default width

                await store.activePage.addElement({
                    type: 'image',
                    src: data.assets.cutout_url,
                    x: x,
                    y: y,
                    width: width,
                    height: width * 1.2, // Approx aspect ratio, user can resize
                });
            }

            // 3. Add Text
            const textConfig = data.template.text_config?.text_fields || [];

            // Headline
            const headline = data.content.headline || "Headline Here";
            const hlConfig = textConfig.find(t => t.name === 'headline') || { x: 50, y: 100, font_size: 60, color: 'white' };
            store.activePage.addElement({
                type: 'text',
                text: headline,
                fontSize: hlConfig.font_size || 60,
                fill: hlConfig.color || 'white',
                x: hlConfig.x || 50,
                y: hlConfig.y || 100,
                width: 980,
                align: 'center',
                fontFamily: 'Oswald' // Example font
            });

            // Summary
            const summary = data.content.summary || "Summary text goes here.";
            const sumConfig = textConfig.find(t => t.name === 'summary') || { x: 50, y: 200, font_size: 30, color: 'white' };
            store.activePage.addElement({
                type: 'text',
                text: summary,
                fontSize: sumConfig.font_size || 30,
                fill: sumConfig.color || 'white',
                x: sumConfig.x || 50,
                y: sumConfig.y || 200,
                width: 980,
                align: 'center',
                fontFamily: 'Roboto'
            });


            setLoading(false);
        } catch (error) {
            console.error("Failed to load Polotno config", error);
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Export to Blob
            const dataUrl = await store.toDataURL({ pixelRatio: 1 }); // 1080x1350
            const blob = await (await fetch(dataUrl)).blob();

            const formData = new FormData();
            formData.append('image', blob, 'poster.png');

            const res = await api.post(`cms/articles/${articleId}/save_poster/`, formData);
            if (onSaveSuccess) onSaveSuccess(res.data.url);
            if (onClose) onClose();

        } catch (e) {
            console.error("Save failed", e);
            alert("Failed to save poster.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center text-white">
                <FaSpinner className="animate-spin text-4xl mb-4" />
                <p>Loading Editor...</p>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
            {/* Header */}
            <div className="h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4">
                <div className="text-white font-bold text-lg">Poster Editor (Beta)</div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors"
                    >
                        {saving ? <FaSpinner className="animate-spin" /> : <FaSave />}
                        Save & Publish
                    </button>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-2">
                        <FaTimes size={20} />
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 relative overflow-hidden">
                <PolotnoContainer className="w-full h-full" style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
                    <SidePanelWrap>
                        <SidePanel store={store} />
                    </SidePanelWrap>
                    <WorkspaceWrap>
                        <Toolbar store={store} />
                        <Workspace store={store} />
                        <ZoomButtons store={store} />
                    </WorkspaceWrap>
                </PolotnoContainer>
            </div>
        </div>
    );
};

export default PosterEditor;
